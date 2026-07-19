/**
 * camelCase (domain model) ↔ snake_case (Supabase row) mapping.
 *
 * `*ToRow` always injects `owner_id` (never trust a locally-stored value —
 * every push is scoped to the signed-in user). `*FromRow` never throws on
 * unexpected/legacy values; it falls back to a safe default instead, since
 * pull results come from the network and must not crash the sync cycle.
 */

import {
  DEFAULT_REPORT_OPTIONS,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  type AnnotationElement,
  type AnnotationRecord,
  type AppSettings,
  type Assignee,
  type Audit,
  type AuditStatus,
  type BaseRecord,
  type Issue,
  type IssuePriority,
  type IssueStatus,
  type PhotoAsset,
  type Project,
  type ProjectLocation,
  type ProjectStatus,
  type ReportExport,
  type ReportOptions,
} from "@/types/models";
import { resolveThemeKey, type ReportThemeKey } from "@/constants/config";
import type { Database, Json } from "@/lib/supabase/database.types";
import { parseSupabaseRef, toSupabaseRef, type StoragePathParts } from "@/lib/supabase/storagePaths";

type Tables = Database["public"]["Tables"];

/* ------------------------------------ Shared ------------------------------------ */

interface BaseRow {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  local_version: number;
  server_version: number;
  sync_status: Database["public"]["Tables"]["projects"]["Row"]["sync_status"];
}

function baseToRow(local: BaseRecord) {
  return {
    id: local.id,
    created_at: local.createdAt,
    updated_at: local.updatedAt,
    deleted_at: local.deletedAt,
    local_version: local.localVersion,
    server_version: local.serverVersion,
    sync_status: local.syncStatus,
  };
}

function baseFromRow(row: BaseRow): BaseRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    localVersion: row.local_version,
    serverVersion: row.server_version,
  };
}

function normalizeIssueStatus(value: string): IssueStatus {
  return (ISSUE_STATUSES as string[]).includes(value) ? (value as IssueStatus) : "open";
}

function normalizeIssuePriority(value: string): IssuePriority {
  return (ISSUE_PRIORITIES as string[]).includes(value) ? (value as IssuePriority) : "medium";
}

function normalizeAuditStatus(value: string): AuditStatus {
  return value === "completed" || value === "issued" ? value : "draft";
}

function normalizeProjectStatus(value: string): ProjectStatus {
  return value === "archived" ? "archived" : "active";
}

function themeKeyFromRow(value: string | null): ReportThemeKey | null {
  return value === null ? null : resolveThemeKey(value);
}

function normalizeReportOptions(value: Json | null | undefined): ReportOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_REPORT_OPTIONS };
  const raw = value as Record<string, unknown>;
  return {
    coverPage: typeof raw.coverPage === "boolean" ? raw.coverPage : DEFAULT_REPORT_OPTIONS.coverPage,
    includeSummary: typeof raw.includeSummary === "boolean" ? raw.includeSummary : DEFAULT_REPORT_OPTIONS.includeSummary,
    includeDetails: typeof raw.includeDetails === "boolean" ? raw.includeDetails : DEFAULT_REPORT_OPTIONS.includeDetails,
    includeOriginalPhotos:
      typeof raw.includeOriginalPhotos === "boolean" ? raw.includeOriginalPhotos : DEFAULT_REPORT_OPTIONS.includeOriginalPhotos,
    includeAnnotatedPhotos:
      typeof raw.includeAnnotatedPhotos === "boolean" ? raw.includeAnnotatedPhotos : DEFAULT_REPORT_OPTIONS.includeAnnotatedPhotos,
    includeTimestamps: typeof raw.includeTimestamps === "boolean" ? raw.includeTimestamps : DEFAULT_REPORT_OPTIONS.includeTimestamps,
    includePageNumbers: typeof raw.includePageNumbers === "boolean" ? raw.includePageNumbers : DEFAULT_REPORT_OPTIONS.includePageNumbers,
    includePhotoLocations:
      typeof raw.includePhotoLocations === "boolean" ? raw.includePhotoLocations : DEFAULT_REPORT_OPTIONS.includePhotoLocations,
    includeSignature: typeof raw.includeSignature === "boolean" ? raw.includeSignature : DEFAULT_REPORT_OPTIONS.includeSignature,
    includeCompleted: typeof raw.includeCompleted === "boolean" ? raw.includeCompleted : DEFAULT_REPORT_OPTIONS.includeCompleted,
    groupBy: raw.groupBy === "location" || raw.groupBy === "assignee" || raw.groupBy === "none" ? raw.groupBy : DEFAULT_REPORT_OPTIONS.groupBy,
    sortBy: raw.sortBy === "capture" || raw.sortBy === "number" ? raw.sortBy : DEFAULT_REPORT_OPTIONS.sortBy,
    imageSize:
      raw.imageSize === "compact" || raw.imageSize === "standard" || raw.imageSize === "large"
        ? raw.imageSize
        : DEFAULT_REPORT_OPTIONS.imageSize,
    themeKey: typeof raw.themeKey === "string" ? resolveThemeKey(raw.themeKey) : DEFAULT_REPORT_OPTIONS.themeKey,
  };
}

function normalizeCheckpoint(value: Json | null | undefined): Record<string, boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  let any = false;
  for (const [key, v] of Object.entries(raw)) {
    if (typeof v === "boolean") {
      out[key] = v;
      any = true;
    }
  }
  return any ? out : null;
}

/* ----------------------------------- Projects ----------------------------------- */

export function projectToRow(local: Project, ownerId: string): Tables["projects"]["Insert"] {
  const cover = parseSupabaseRef(local.coverPhotoUri);
  const logo = parseSupabaseRef(local.logoUri);
  return {
    ...baseToRow(local),
    owner_id: ownerId,
    name: local.name,
    reference: local.reference,
    client_name: local.clientName,
    site_address: local.siteAddress,
    company_name: local.companyName,
    inspector_name: local.inspectorName,
    cover_bucket: cover?.bucket ?? null,
    cover_path: cover?.path ?? null,
    logo_bucket: logo?.bucket ?? null,
    logo_path: logo?.path ?? null,
    status: local.status,
    last_report_theme_key: local.lastReportThemeKey ?? null,
  };
}

export function projectFromRow(row: Tables["projects"]["Row"]): Project {
  return {
    ...baseFromRow(row),
    name: row.name,
    reference: row.reference,
    clientName: row.client_name,
    siteAddress: row.site_address,
    companyName: row.company_name,
    inspectorName: row.inspector_name,
    coverPhotoUri: row.cover_bucket && row.cover_path ? toSupabaseRef(row.cover_bucket, row.cover_path) : null,
    logoUri: row.logo_bucket && row.logo_path ? toSupabaseRef(row.logo_bucket, row.logo_path) : null,
    status: normalizeProjectStatus(row.status),
    lastReportThemeKey: themeKeyFromRow(row.last_report_theme_key),
  };
}

/* ------------------------------------ Locations ------------------------------------ */

export function locationToRow(local: ProjectLocation, ownerId: string): Tables["project_locations"]["Insert"] {
  return {
    ...baseToRow(local),
    owner_id: ownerId,
    project_id: local.projectId,
    name: local.name,
    sort_order: local.sortOrder,
  };
}

export function locationFromRow(row: Tables["project_locations"]["Row"]): ProjectLocation {
  return {
    ...baseFromRow(row),
    projectId: row.project_id,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

/* ------------------------------------ Assignees ------------------------------------ */

export function assigneeToRow(local: Assignee, ownerId: string): Tables["assignees"]["Insert"] {
  return {
    ...baseToRow(local),
    owner_id: ownerId,
    name: local.name,
    company: local.company,
    email: local.email,
    phone: local.phone,
    trade: local.trade,
  };
}

export function assigneeFromRow(row: Tables["assignees"]["Row"]): Assignee {
  return {
    ...baseFromRow(row),
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    trade: row.trade,
  };
}

/* -------------------------------------- Audits -------------------------------------- */

export function auditToRow(local: Audit, ownerId: string): Tables["audits"]["Insert"] {
  return {
    ...baseToRow(local),
    owner_id: ownerId,
    project_id: local.projectId,
    title: local.title,
    audit_date: local.auditDate,
    prepared_for: local.preparedFor,
    prepared_by: local.preparedBy,
    status: local.status,
    notes: local.notes,
    default_location_id: local.defaultLocationId,
    default_assignee_id: local.defaultAssigneeId,
    theme_key: local.themeKey,
    completed_at: local.completedAt,
    report_issued_at: local.reportIssuedAt,
  };
}

export function auditFromRow(row: Tables["audits"]["Row"]): Audit {
  return {
    ...baseFromRow(row),
    projectId: row.project_id,
    title: row.title,
    auditDate: row.audit_date,
    preparedFor: row.prepared_for,
    preparedBy: row.prepared_by,
    status: normalizeAuditStatus(row.status),
    notes: row.notes,
    defaultLocationId: row.default_location_id,
    defaultAssigneeId: row.default_assignee_id,
    themeKey: resolveThemeKey(row.theme_key),
    completedAt: row.completed_at,
    reportIssuedAt: row.report_issued_at,
  };
}

/* -------------------------------------- Issues -------------------------------------- */

export function issueToRow(local: Issue, ownerId: string): Tables["issues"]["Insert"] {
  return {
    ...baseToRow(local),
    owner_id: ownerId,
    audit_id: local.auditId,
    project_id: local.projectId,
    location_id: local.locationId,
    issue_number: local.issueNumber,
    title: local.title,
    description: local.description,
    status: local.status,
    priority: local.priority,
    assignee_id: local.assigneeId,
    include_in_report: local.includeInReport,
    sort_order: local.sortOrder,
  };
}

export function issueFromRow(row: Tables["issues"]["Row"]): Issue {
  return {
    ...baseFromRow(row),
    auditId: row.audit_id,
    projectId: row.project_id,
    locationId: row.location_id,
    issueNumber: row.issue_number,
    title: row.title,
    description: row.description,
    status: normalizeIssueStatus(row.status),
    priority: normalizeIssuePriority(row.priority),
    assigneeId: row.assignee_id,
    includeInReport: row.include_in_report,
    sortOrder: row.sort_order,
  };
}

/* ----------------------------------- Photo assets ----------------------------------- */

export interface PhotoAssetMediaOverrides {
  original?: StoragePathParts | null;
  report?: StoragePathParts | null;
  thumb?: StoragePathParts | null;
  annotated?: StoragePathParts | null;
}

export function photoAssetToRow(
  local: PhotoAsset,
  ownerId: string,
  overrides: PhotoAssetMediaOverrides = {},
): Tables["photo_assets"]["Insert"] {
  const original = overrides.original !== undefined ? overrides.original : parseSupabaseRef(local.originalUri);
  const report = overrides.report !== undefined ? overrides.report : parseSupabaseRef(local.reportUri);
  const thumb = overrides.thumb !== undefined ? overrides.thumb : parseSupabaseRef(local.thumbUri);
  const annotated = overrides.annotated !== undefined ? overrides.annotated : parseSupabaseRef(local.annotatedUri);
  return {
    ...baseToRow(local),
    owner_id: ownerId,
    issue_id: local.issueId,
    audit_id: local.auditId,
    project_id: local.projectId,
    original_bucket: original?.bucket ?? null,
    original_path: original?.path ?? null,
    report_bucket: report?.bucket ?? null,
    report_path: report?.path ?? null,
    thumb_bucket: thumb?.bucket ?? null,
    thumb_path: thumb?.path ?? null,
    annotated_bucket: annotated?.bucket ?? null,
    annotated_path: annotated?.path ?? null,
    width: local.width,
    height: local.height,
    captured_at: local.capturedAt,
  };
}

export interface PhotoAssetFallbackUris {
  originalUri?: string;
  reportUri?: string;
  thumbUri?: string;
  annotatedUri?: string | null;
}

/**
 * `fallback` supplies the existing local file URI for a variant when the
 * remote row hasn't recorded an upload yet (bucket/path null) — this keeps
 * pull merges from blanking out a photo that simply hasn't finished
 * uploading from another device. Falls back to `""` (never `null`) for
 * original/report/thumb to satisfy `PhotoAsset`'s non-nullable URI fields
 * only when there truly is no local copy either.
 */
export function photoAssetFromRow(row: Tables["photo_assets"]["Row"], fallback: PhotoAssetFallbackUris = {}): PhotoAsset {
  const original =
    row.original_bucket && row.original_path ? toSupabaseRef(row.original_bucket, row.original_path) : fallback.originalUri ?? "";
  const report =
    row.report_bucket && row.report_path ? toSupabaseRef(row.report_bucket, row.report_path) : fallback.reportUri ?? "";
  const thumb = row.thumb_bucket && row.thumb_path ? toSupabaseRef(row.thumb_bucket, row.thumb_path) : fallback.thumbUri ?? "";
  const annotated =
    row.annotated_bucket && row.annotated_path
      ? toSupabaseRef(row.annotated_bucket, row.annotated_path)
      : fallback.annotatedUri ?? null;
  return {
    ...baseFromRow(row),
    issueId: row.issue_id,
    auditId: row.audit_id,
    projectId: row.project_id,
    originalUri: original,
    reportUri: report,
    thumbUri: thumb,
    annotatedUri: annotated,
    width: row.width,
    height: row.height,
    capturedAt: row.captured_at,
  };
}

/* --------------------------------- Annotation records --------------------------------- */

export function annotationToRow(local: AnnotationRecord, ownerId: string): Tables["annotation_records"]["Insert"] {
  return {
    ...baseToRow(local),
    owner_id: ownerId,
    asset_id: local.assetId,
    issue_id: local.issueId,
    elements: local.elements as unknown as Json,
    toolset_version: local.toolsetVersion,
  };
}

export function annotationFromRow(row: Tables["annotation_records"]["Row"]): AnnotationRecord {
  return {
    ...baseFromRow(row),
    assetId: row.asset_id,
    issueId: row.issue_id,
    elements: Array.isArray(row.elements) ? (row.elements as unknown as AnnotationElement[]) : [],
    toolsetVersion: row.toolset_version,
  };
}

/* ----------------------------------- Report exports ----------------------------------- */

export function reportExportToRow(
  local: ReportExport,
  ownerId: string,
  pdfOverride?: StoragePathParts | null,
): Tables["report_exports"]["Insert"] {
  const pdf = pdfOverride !== undefined ? pdfOverride : parseSupabaseRef(local.pdfUri);
  return {
    ...baseToRow(local),
    owner_id: ownerId,
    audit_id: local.auditId,
    project_id: local.projectId,
    pdf_bucket: pdf?.bucket ?? null,
    pdf_path: pdf?.path ?? null,
    issue_count: local.issueCount,
    photo_count: local.photoCount,
    options: local.options as unknown as Json,
  };
}

export function reportExportFromRow(row: Tables["report_exports"]["Row"], fallbackPdfUri?: string): ReportExport {
  const pdf = row.pdf_bucket && row.pdf_path ? toSupabaseRef(row.pdf_bucket, row.pdf_path) : fallbackPdfUri ?? "";
  return {
    ...baseFromRow(row),
    auditId: row.audit_id,
    projectId: row.project_id,
    pdfUri: pdf,
    issueCount: row.issue_count,
    photoCount: row.photo_count,
    options: normalizeReportOptions(row.options),
  };
}

/* ------------------------------------- Settings ------------------------------------- */

export function appSettingsToRow(
  settings: AppSettings,
  ownerId: string,
  logoOverride?: StoragePathParts | null,
): Tables["user_settings"]["Insert"] {
  const logo = logoOverride !== undefined ? logoOverride : parseSupabaseRef(settings.logoUri);
  return {
    owner_id: ownerId,
    inspector_name: settings.inspectorName,
    company_name: settings.companyName,
    logo_bucket: logo?.bucket ?? null,
    logo_path: logo?.path ?? null,
    report_footer_text: settings.reportFooterText,
    default_report_options: settings.defaultReportOptions as unknown as Json,
    upload_wifi_only: settings.uploadWifiOnly,
    keep_awake_while_uploading: settings.keepAwakeWhileUploading,
    storage_notice_dismissed_at: settings.storageNoticeDismissedAt,
    last_time_to_first_issue_ms: settings.lastTimeToFirstIssueMs,
    last_audit_id: settings.lastAuditId,
    last_location_id: settings.lastLocationId,
    last_assignee_id: settings.lastAssigneeId,
    last_priority: settings.lastPriority,
    demo_seeded: settings.demoSeeded,
    local_import_completed_at: settings.cloudImportCompletedAt,
    local_import_checkpoint: (settings.cloudImportCheckpoint ?? {}) as unknown as Json,
  };
}

export function appSettingsFromRow(
  row: Tables["user_settings"]["Row"],
  fallbackLogoUri: string | null = null,
): AppSettings {
  const logo = row.logo_bucket && row.logo_path ? toSupabaseRef(row.logo_bucket, row.logo_path) : fallbackLogoUri;
  return {
    inspectorName: row.inspector_name,
    companyName: row.company_name,
    logoUri: logo,
    reportFooterText: row.report_footer_text,
    defaultReportOptions: normalizeReportOptions(row.default_report_options),
    demoSeeded: row.demo_seeded,
    lastAuditId: row.last_audit_id,
    lastLocationId: row.last_location_id,
    lastAssigneeId: row.last_assignee_id,
    lastPriority: normalizeIssuePriority(row.last_priority),
    uploadWifiOnly: row.upload_wifi_only,
    keepAwakeWhileUploading: row.keep_awake_while_uploading,
    storageNoticeDismissedAt: row.storage_notice_dismissed_at,
    lastTimeToFirstIssueMs: row.last_time_to_first_issue_ms,
    cloudImportCompletedAt: row.local_import_completed_at,
    cloudImportCheckpoint: normalizeCheckpoint(row.local_import_checkpoint),
  };
}

/* -------------------------------------- Profile -------------------------------------- */

/** Account profile — 1:1 with `auth.users`, distinct from per-device `AppSettings`. */
export interface Profile {
  id: string;
  email: string | null;
  displayName: string;
  companyName: string;
  logoUri: string | null;
}

export function profileFromRow(row: Tables["profiles"]["Row"]): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    companyName: row.company_name,
    logoUri: row.logo_bucket && row.logo_path ? toSupabaseRef(row.logo_bucket, row.logo_path) : null,
  };
}

export interface ProfileUpdateInput {
  displayName?: string;
  companyName?: string;
  logoUri?: string | null;
}

export function profileUpdateToRow(patch: ProfileUpdateInput): Tables["profiles"]["Update"] {
  const row: Tables["profiles"]["Update"] = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.companyName !== undefined) row.company_name = patch.companyName;
  if (patch.logoUri !== undefined) {
    const logo = parseSupabaseRef(patch.logoUri);
    row.logo_bucket = logo?.bucket ?? null;
    row.logo_path = logo?.path ?? null;
  }
  return row;
}
