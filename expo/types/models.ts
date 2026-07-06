/**
 * Domain model — lighter hierarchy for solo site audits:
 * Project → Location → Audit → Issue → Photos → Annotations → Report.
 *
 * Every record carries local-first sync fields so cloud sync can be added
 * later without a schema rewrite.
 */

import type { ReportThemeKey } from "@/constants/config";

export type SyncStatus = "local_only" | "pending_upload" | "synced" | "conflict" | "error";

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  localVersion: number;
  serverVersion: number;
}

export type ProjectStatus = "active" | "archived";

export interface Project extends BaseRecord {
  name: string;
  reference: string;
  clientName: string;
  siteAddress: string;
  companyName: string;
  inspectorName: string;
  /** Local URI or remote URL for an optional cover photo. */
  coverPhotoUri: string | null;
  /** Local URI or remote URL for an optional project logo. */
  logoUri: string | null;
  status: ProjectStatus;
}

export interface ProjectLocation extends BaseRecord {
  projectId: string;
  name: string;
  sortOrder: number;
}

export interface Assignee extends BaseRecord {
  name: string;
  company: string;
  email: string;
  phone: string;
  trade: string;
}

export type AuditStatus = "draft" | "completed" | "issued";

export interface Audit extends BaseRecord {
  projectId: string;
  title: string;
  /** ISO date (yyyy-mm-dd). */
  auditDate: string;
  preparedFor: string;
  preparedBy: string;
  status: AuditStatus;
  notes: string;
  defaultLocationId: string | null;
  defaultAssigneeId: string | null;
  themeKey: ReportThemeKey;
  completedAt: string | null;
  reportIssuedAt: string | null;
}

export type IssueStatus = "open" | "assigned" | "in_progress" | "completed";
export type IssuePriority = "low" | "medium" | "high";

export const ISSUE_STATUSES: IssueStatus[] = ["open", "assigned", "in_progress", "completed"];
export const ISSUE_PRIORITIES: IssuePriority[] = ["low", "medium", "high"];

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
};

export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export interface Issue extends BaseRecord {
  auditId: string;
  projectId: string;
  locationId: string | null;
  issueNumber: number;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  includeInReport: boolean;
  sortOrder: number;
}

export interface PhotoAsset extends BaseRecord {
  issueId: string;
  auditId: string;
  projectId: string;
  /** Full-size original, preserved untouched. */
  originalUri: string;
  /** Report-size compressed working copy (used for markup + PDF). */
  reportUri: string;
  /** Small thumbnail for lists. */
  thumbUri: string;
  /** Flattened annotated copy, generated on markup save. */
  annotatedUri: string | null;
  width: number;
  height: number;
  capturedAt: string;
}

/* ---------------------------------- Annotations ---------------------------------- */

/**
 * All coordinates are normalised 0..1 relative to the image.
 * Stroke widths / font sizes are relative to a virtual 1000px-wide canvas
 * so markup renders identically in-app and in the PDF.
 */
export type AnnotationElement =
  | { id: string; type: "arrow"; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number }
  | { id: string; type: "ellipse"; cx: number; cy: number; rx: number; ry: number; stroke: string; strokeWidth: number }
  | { id: string; type: "rect"; x: number; y: number; width: number; height: number; stroke: string; strokeWidth: number }
  | { id: string; type: "pen"; points: { x: number; y: number }[]; stroke: string; strokeWidth: number }
  | { id: string; type: "text"; x: number; y: number; text: string; color: string; fontSize: number }
  | { id: string; type: "callout"; cx: number; cy: number; number: number; color: string; size: number }
  | { id: string; type: "blur"; x: number; y: number; width: number; height: number; intensity: number };

export type AnnotationElementType = AnnotationElement["type"];

export interface AnnotationRecord extends BaseRecord {
  assetId: string;
  issueId: string;
  elements: AnnotationElement[];
  toolsetVersion: number;
}

/* ------------------------------------ Reports ------------------------------------ */

export type ReportGroupBy = "location" | "assignee" | "none";
export type ReportSortBy = "capture" | "number";
export type ReportImageSize = "compact" | "standard" | "large";

export interface ReportOptions {
  coverPage: boolean;
  includeSummary: boolean;
  includeDetails: boolean;
  includeOriginalPhotos: boolean;
  includeAnnotatedPhotos: boolean;
  includeTimestamps: boolean;
  includePageNumbers: boolean;
  includePhotoLocations: boolean;
  includeSignature: boolean;
  includeCompleted: boolean;
  groupBy: ReportGroupBy;
  sortBy: ReportSortBy;
  imageSize: ReportImageSize;
  themeKey: ReportThemeKey;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  coverPage: true,
  includeSummary: true,
  includeDetails: true,
  includeOriginalPhotos: false,
  includeAnnotatedPhotos: true,
  includeTimestamps: true,
  includePageNumbers: true,
  includePhotoLocations: true,
  includeSignature: true,
  includeCompleted: true,
  groupBy: "location",
  sortBy: "number",
  imageSize: "standard",
  themeKey: "navy",
};

export interface ReportExport extends BaseRecord {
  auditId: string;
  projectId: string;
  pdfUri: string;
  issueCount: number;
  photoCount: number;
  options: ReportOptions;
}

/* ---------------------------------- Sync placeholder ---------------------------------- */

export type OutboxOperation = "create" | "update" | "delete";

export interface OutboxEntry {
  id: string;
  table: string;
  recordId: string;
  op: OutboxOperation;
  at: string;
}

/* ------------------------------------ Settings ------------------------------------ */

export interface AppSettings {
  inspectorName: string;
  companyName: string;
  defaultReportOptions: ReportOptions;
  demoSeeded: boolean;
  lastAuditId: string | null;
  lastLocationId: string | null;
  lastAssigneeId: string | null;
  lastPriority: IssuePriority;
  uploadWifiOnly: boolean;
  keepAwakeWhileUploading: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  inspectorName: "",
  companyName: "",
  defaultReportOptions: DEFAULT_REPORT_OPTIONS,
  demoSeeded: false,
  lastAuditId: null,
  lastLocationId: null,
  lastAssigneeId: null,
  lastPriority: "medium",
  uploadWifiOnly: true,
  keepAwakeWhileUploading: false,
};
