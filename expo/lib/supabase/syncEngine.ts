/**
 * Cloud sync engine — push local outbox changes, pull remote changes, merge.
 *
 * Local-first: this is only ever called opportunistically (manual "Sync
 * now", app foreground, after sign-in). The app must remain fully usable
 * with sync never having run. Every failure path returns a structured
 * result instead of throwing — a bad network or an expired session should
 * never crash the caller.
 *
 * Media upload is best-effort: on native it reads the local file and
 * uploads real bytes; on web (no reliable binary file access for
 * `file://`-less picked images) it honestly reports the variant as
 * skipped rather than pretending success. Skipped variants keep the
 * asset's syncStatus at "pending_upload" so a later native sync finishes
 * the job.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  annotationFromRow,
  annotationToRow,
  appSettingsFromRow,
  appSettingsToRow,
  assigneeFromRow,
  assigneeToRow,
  auditFromRow,
  auditToRow,
  issueFromRow,
  issueToRow,
  locationFromRow,
  locationToRow,
  photoAssetFromRow,
  photoAssetToRow,
  projectFromRow,
  projectToRow,
  reportExportFromRow,
  reportExportToRow,
} from "@/lib/supabase/mappers";
import { resolveConflict, type VersionedRecord } from "@/lib/supabase/conflicts";
import { materializeCloudRef } from "@/lib/supabase/mediaCache";
import {
  buildAccountLogoPath,
  buildPhotoAssetPath,
  buildProjectCoverPath,
  buildProjectLogoPath,
  buildReportExportPath,
  isSupabaseRef,
  needsUpload,
  parseSupabaseRef,
  toSupabaseRef,
  type PhotoAssetVariant,
  type StoragePathParts,
} from "@/lib/supabase/storagePaths";
import { isPushTableName, PUSH_TABLE_ORDER, sortOutboxForPush, type PushTableName } from "@/lib/supabase/syncOrder";
import { classifySyncError, type ClassifiedSyncError } from "@/lib/supabase/syncRetry";
import { newId, nowIso } from "@/lib/ids";
import { buildImportOutboxBatch, detectNeedsImport, isImportComplete, markImportCompleted } from "@/lib/supabase/localImport";
import { appendOutbox, compactOutbox } from "@/lib/persistence/outbox";
import { loadDb, loadSettings, saveDb, saveSettings, type Db } from "@/lib/store";
import type { AppSettings, OutboxEntry, PhotoAsset, Project, ReportExport, SyncStatus } from "@/types/models";

type Tables = Database["public"]["Tables"];
type SupabaseClientT = Awaited<ReturnType<typeof getSupabase>>;

const PAGE_SIZE = 500;
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

export interface SyncCycleResult {
  ok: boolean;
  configured: boolean;
  authenticated: boolean;
  pushed: number;
  pushFailed: number;
  pulled: number;
  mediaUploaded: number;
  mediaSkipped: number;
  errors: string[];
}

function emptyResult(): SyncCycleResult {
  return {
    ok: false,
    configured: false,
    authenticated: false,
    pushed: 0,
    pushFailed: 0,
    pulled: 0,
    mediaUploaded: 0,
    mediaSkipped: 0,
    errors: [],
  };
}

/* ------------------------------------- Media upload ------------------------------------- */

function mimeFromPath(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "pdf":
      return "application/pdf";
    default:
      return "image/jpeg";
  }
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Plain-JS base64 → bytes (no Buffer / atob dependency needed on either platform). */
function decodeBase64(base64: string): Uint8Array {
  const lookup = new Uint8Array(256);
  for (let i = 0; i < BASE64_CHARS.length; i++) lookup[BASE64_CHARS.charCodeAt(i)] = i;

  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const len = clean.length;
  let bufferLength = (len * 3) / 4;
  if (clean[len - 1] === "=") bufferLength--;
  if (clean[len - 2] === "=") bufferLength--;

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[clean.charCodeAt(i)] ?? 0;
    const e2 = lookup[clean.charCodeAt(i + 1)] ?? 0;
    const e3 = lookup[clean.charCodeAt(i + 2)] ?? 0;
    const e4 = lookup[clean.charCodeAt(i + 3)] ?? 0;
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (clean[i + 2] !== "=" && clean[i + 2] !== undefined) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (clean[i + 3] !== "=" && clean[i + 3] !== undefined) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes;
}

async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return decodeBase64(base64);
}

interface UploadOutcome {
  ok: boolean;
  skipped: boolean;
  error?: string;
}

async function uploadLocalMedia(supabase: SupabaseClientT, dest: StoragePathParts, localUri: string): Promise<UploadOutcome> {
  try {
    const bytes =
      Platform.OS === "web"
        ? await (await fetch(localUri)).arrayBuffer()
        : await readFileAsBytes(localUri);
    const { error } = await supabase.storage.from(dest.bucket).upload(dest.path, bytes, {
      contentType: mimeFromPath(dest.path),
      upsert: true,
    });
    if (error) return { ok: false, skipped: false, error: error.message };
    return { ok: true, skipped: false };
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* --------------------------------------- Push helpers --------------------------------------- */

type PushOutcome =
  | { ok: true; db: Db; mediaUploaded?: number; mediaSkipped?: number; pending?: boolean; warning?: string }
  | { ok: false; error: ClassifiedSyncError };

interface UpsertResponse {
  data: { server_version: number } | null;
  error: { message: string; code?: string; status?: number } | null;
}

type VersionedWrite = (row: unknown, expectedServerVersion: number) => Promise<UpsertResponse>;

function remoteSyncedRow(row: unknown): unknown {
  return { ...(row as Record<string, unknown>), sync_status: "synced" };
}

async function versionCheckedWrite(
  expectedServerVersion: number,
  probe: () => PromiseLike<unknown>,
  insert: () => PromiseLike<unknown>,
  update: () => PromiseLike<unknown>,
): Promise<UpsertResponse> {
  const current = (await probe()) as UpsertResponse;
  if (current.error) return current;
  if (!current.data) return (await insert()) as UpsertResponse;
  if (current.data.server_version !== expectedServerVersion) {
    return {
      data: null,
      error: {
        status: 409,
        code: "SYNC_VERSION_CONFLICT",
        message: `Remote version ${current.data.server_version} no longer matches local base ${expectedServerVersion}.`,
      },
    };
  }
  const updated = (await update()) as UpsertResponse;
  if (!updated.error && !updated.data) {
    return {
      data: null,
      error: { status: 409, code: "SYNC_VERSION_CONFLICT", message: "The remote row changed during this sync." },
    };
  }
  return updated;
}

async function pushSimple<TLocal extends VersionedRecord>(
  write: VersionedWrite,
  list: TLocal[],
  recordId: string,
  toRow: (local: TLocal, ownerId: string) => unknown,
  ownerId: string,
): Promise<{ ok: true; list: TLocal[] } | { ok: false; error: ClassifiedSyncError }> {
  const record = list.find((r) => r.id === recordId);
  if (!record) return { ok: true, list };

  const row = remoteSyncedRow(toRow(record, ownerId));
  const response = await write(row, record.serverVersion);
  if (response.error) return { ok: false, error: classifySyncError(response.error) };

  const nextList = list.map((r) =>
    r.id === recordId
      ? { ...r, syncStatus: "synced" as SyncStatus, serverVersion: response.data?.server_version ?? r.serverVersion }
      : r,
  );
  return { ok: true, list: nextList };
}

async function pushLocation(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row, expected) => {
      const typed = row as Tables["project_locations"]["Insert"];
      return versionCheckedWrite(
        expected,
        () => supabase.from("project_locations").select("server_version").eq("id", typed.id).maybeSingle(),
        () => supabase.from("project_locations").insert(typed).select("server_version").single(),
        () => supabase.from("project_locations").update(typed).eq("id", typed.id).eq("server_version", expected).select("server_version").maybeSingle(),
      );
    },
    db.locations,
    recordId,
    locationToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, locations: result.list } } : result;
}

async function pushAssignee(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row, expected) => {
      const typed = row as Tables["assignees"]["Insert"];
      return versionCheckedWrite(
        expected,
        () => supabase.from("assignees").select("server_version").eq("id", typed.id).maybeSingle(),
        () => supabase.from("assignees").insert(typed).select("server_version").single(),
        () => supabase.from("assignees").update(typed).eq("id", typed.id).eq("server_version", expected).select("server_version").maybeSingle(),
      );
    },
    db.assignees,
    recordId,
    assigneeToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, assignees: result.list } } : result;
}

async function pushAudit(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row, expected) => {
      const typed = row as Tables["audits"]["Insert"];
      return versionCheckedWrite(
        expected,
        () => supabase.from("audits").select("server_version").eq("id", typed.id).maybeSingle(),
        () => supabase.from("audits").insert(typed).select("server_version").single(),
        () => supabase.from("audits").update(typed).eq("id", typed.id).eq("server_version", expected).select("server_version").maybeSingle(),
      );
    },
    db.audits,
    recordId,
    auditToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, audits: result.list } } : result;
}

async function pushIssue(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row, expected) => {
      const typed = row as Tables["issues"]["Insert"];
      return versionCheckedWrite(
        expected,
        () => supabase.from("issues").select("server_version").eq("id", typed.id).maybeSingle(),
        () => supabase.from("issues").insert(typed).select("server_version").single(),
        () => supabase.from("issues").update(typed).eq("id", typed.id).eq("server_version", expected).select("server_version").maybeSingle(),
      );
    },
    db.issues,
    recordId,
    issueToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, issues: result.list } } : result;
}

async function pushAnnotation(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row, expected) => {
      const typed = row as Tables["annotation_records"]["Insert"];
      return versionCheckedWrite(
        expected,
        () => supabase.from("annotation_records").select("server_version").eq("id", typed.id).maybeSingle(),
        () => supabase.from("annotation_records").insert(typed).select("server_version").single(),
        () => supabase.from("annotation_records").update(typed).eq("id", typed.id).eq("server_version", expected).select("server_version").maybeSingle(),
      );
    },
    db.annotations,
    recordId,
    annotationToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, annotations: result.list } } : result;
}

async function pushProject(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const record = db.projects.find((p) => p.id === recordId);
  if (!record) return { ok: true, db };

  let working: Project = record;
  let mediaUploaded = 0;
  let mediaSkipped = 0;
  const mediaErrors: string[] = [];

  if (needsUpload(working.coverPhotoUri) && !working.coverPhotoCloudRef) {
    const dest = buildProjectCoverPath(ownerId, working.id, working.coverPhotoUri, working.localVersion);
    const outcome = await uploadLocalMedia(supabase, dest, working.coverPhotoUri as string);
    if (outcome.ok) {
      working = { ...working, coverPhotoCloudRef: toSupabaseRef(dest.bucket, dest.path) };
      mediaUploaded += 1;
    } else if (outcome.skipped) {
      mediaSkipped += 1;
    } else if (outcome.error) {
      mediaErrors.push(outcome.error);
    }
  }
  if (needsUpload(working.logoUri) && !working.logoCloudRef) {
    const dest = buildProjectLogoPath(ownerId, working.id, working.logoUri, working.localVersion);
    const outcome = await uploadLocalMedia(supabase, dest, working.logoUri as string);
    if (outcome.ok) {
      working = { ...working, logoCloudRef: toSupabaseRef(dest.bucket, dest.path) };
      mediaUploaded += 1;
    } else if (outcome.skipped) {
      mediaSkipped += 1;
    } else if (outcome.error) {
      mediaErrors.push(outcome.error);
    }
  }

  const row = remoteSyncedRow(projectToRow(working, ownerId)) as Tables["projects"]["Insert"];
  const { data, error } = await versionCheckedWrite(
    record.serverVersion,
    () => supabase.from("projects").select("server_version").eq("id", row.id).maybeSingle(),
    () => supabase.from("projects").insert(row).select("server_version").single(),
    () => supabase.from("projects").update(row).eq("id", row.id).eq("server_version", record.serverVersion).select("server_version").maybeSingle(),
  );
  if (error) return { ok: false, error: classifySyncError(error) };

  const stillPendingMedia =
    (needsUpload(working.coverPhotoUri) && !working.coverPhotoCloudRef) ||
    (needsUpload(working.logoUri) && !working.logoCloudRef);
  const nextRecord: Project = {
    ...working,
    syncStatus: stillPendingMedia ? "pending_upload" : "synced",
    serverVersion: data?.server_version ?? working.serverVersion,
  };
  const projects = db.projects.map((p) => (p.id === recordId ? nextRecord : p));
  return {
    ok: true,
    db: { ...db, projects },
    mediaUploaded,
    mediaSkipped,
    pending: stillPendingMedia,
    warning: mediaErrors[0],
  };
}

async function pushAsset(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const record = db.assets.find((a) => a.id === recordId);
  if (!record) return { ok: true, db };

  let working: PhotoAsset = record;
  let mediaUploaded = 0;
  let mediaSkipped = 0;
  const mediaErrors: string[] = [];

  const variants: [PhotoAssetVariant, string | null, string | null | undefined][] = [
    ["original", working.originalUri, working.originalCloudRef],
    ["report", working.reportUri, working.reportCloudRef],
    ["thumb", working.thumbUri, working.thumbCloudRef],
    ["annotated", working.annotatedUri, working.annotatedCloudRef],
  ];

  for (const [variant, uri, cloudRef] of variants) {
    if (!needsUpload(uri) || cloudRef) continue;
    const dest = buildPhotoAssetPath(
      ownerId,
      working.projectId,
      working.issueId,
      working.id,
      variant,
      uri,
      working.localVersion,
    );
    const outcome = await uploadLocalMedia(supabase, dest, uri as string);
    if (outcome.ok) {
      const ref = toSupabaseRef(dest.bucket, dest.path);
      working =
        variant === "original"
          ? { ...working, originalCloudRef: ref }
          : variant === "report"
            ? { ...working, reportCloudRef: ref }
            : variant === "thumb"
              ? { ...working, thumbCloudRef: ref }
              : { ...working, annotatedCloudRef: ref };
      mediaUploaded += 1;
    } else if (outcome.skipped) {
      mediaSkipped += 1;
    } else if (outcome.error) {
      mediaErrors.push(outcome.error);
    }
  }

  const row = remoteSyncedRow(photoAssetToRow(working, ownerId)) as Tables["photo_assets"]["Insert"];
  const { data, error } = await versionCheckedWrite(
    record.serverVersion,
    () => supabase.from("photo_assets").select("server_version").eq("id", row.id).maybeSingle(),
    () => supabase.from("photo_assets").insert(row).select("server_version").single(),
    () => supabase.from("photo_assets").update(row).eq("id", row.id).eq("server_version", record.serverVersion).select("server_version").maybeSingle(),
  );
  if (error) return { ok: false, error: classifySyncError(error) };

  const stillPending =
    (needsUpload(working.originalUri) && !working.originalCloudRef) ||
    (needsUpload(working.reportUri) && !working.reportCloudRef) ||
    (needsUpload(working.thumbUri) && !working.thumbCloudRef) ||
    (needsUpload(working.annotatedUri) && !working.annotatedCloudRef);
  const nextRecord: PhotoAsset = {
    ...working,
    syncStatus: stillPending ? "pending_upload" : "synced",
    serverVersion: data?.server_version ?? working.serverVersion,
  };
  const assets = db.assets.map((a) => (a.id === recordId ? nextRecord : a));
  return {
    ok: true,
    db: { ...db, assets },
    mediaUploaded,
    mediaSkipped,
    pending: stillPending,
    warning: mediaErrors[0],
  };
}

async function pushReport(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const record = db.reports.find((r) => r.id === recordId);
  if (!record) return { ok: true, db };

  let working: ReportExport = record;
  let mediaUploaded = 0;
  let mediaSkipped = 0;
  let mediaError: string | undefined;

  if (needsUpload(working.pdfUri) && !working.pdfCloudRef) {
    const dest = buildReportExportPath(ownerId, working.auditId, working.id);
    const outcome = await uploadLocalMedia(supabase, dest, working.pdfUri);
    if (outcome.ok) {
      working = { ...working, pdfCloudRef: toSupabaseRef(dest.bucket, dest.path) };
      mediaUploaded += 1;
    } else if (outcome.skipped) {
      mediaSkipped += 1;
    } else {
      mediaError = outcome.error;
    }
  }

  const row = remoteSyncedRow(reportExportToRow(working, ownerId)) as Tables["report_exports"]["Insert"];
  const { data, error } = await versionCheckedWrite(
    record.serverVersion,
    () => supabase.from("report_exports").select("server_version").eq("id", row.id).maybeSingle(),
    () => supabase.from("report_exports").insert(row).select("server_version").single(),
    () => supabase.from("report_exports").update(row).eq("id", row.id).eq("server_version", record.serverVersion).select("server_version").maybeSingle(),
  );
  if (error) return { ok: false, error: classifySyncError(error) };

  const nextRecord: ReportExport = {
    ...working,
    syncStatus: needsUpload(working.pdfUri) && !working.pdfCloudRef ? "pending_upload" : "synced",
    serverVersion: data?.server_version ?? working.serverVersion,
  };
  const reports = db.reports.map((r) => (r.id === recordId ? nextRecord : r));
  return {
    ok: true,
    db: { ...db, reports },
    mediaUploaded,
    mediaSkipped,
    pending: needsUpload(working.pdfUri) && !working.pdfCloudRef,
    warning: mediaError,
  };
}

async function pushOne(supabase: SupabaseClientT, table: PushTableName, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  switch (table) {
    case "projects":
      return pushProject(supabase, recordId, db, ownerId);
    case "locations":
      return pushLocation(supabase, recordId, db, ownerId);
    case "assignees":
      return pushAssignee(supabase, recordId, db, ownerId);
    case "audits":
      return pushAudit(supabase, recordId, db, ownerId);
    case "issues":
      return pushIssue(supabase, recordId, db, ownerId);
    case "assets":
      return pushAsset(supabase, recordId, db, ownerId);
    case "annotations":
      return pushAnnotation(supabase, recordId, db, ownerId);
    case "reports":
      return pushReport(supabase, recordId, db, ownerId);
  }
}

/* --------------------------------------- Pull helpers --------------------------------------- */

type PageFetcher<TRow> = (
  sinceIso: string,
  from: number,
  to: number,
) => PromiseLike<{ data: TRow[] | null; error: { message: string } | null }>;

async function fetchChangedRows<TRow extends { updated_at: string }>(
  queryPage: PageFetcher<TRow>,
  sinceIso: string,
): Promise<TRow[]> {
  const rows: TRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await queryPage(sinceIso, offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

function mergeRemoteIntoLocal<TLocal extends VersionedRecord>(
  list: TLocal[],
  remotes: TLocal[],
): { list: TLocal[]; pulled: number } {
  if (remotes.length === 0) return { list, pulled: 0 };
  const byId = new Map(list.map((r) => [r.id, r]));
  let pulled = 0;
  for (const remote of remotes) {
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, remote);
      pulled += 1;
      continue;
    }
    const resolution = resolveConflict({ local, remote, lastSyncedServerVersion: local.serverVersion });
    if (resolution.outcome !== "use-local") {
      byId.set(remote.id, resolution.record);
      pulled += 1;
    }
  }
  return { list: Array.from(byId.values()), pulled };
}

async function materializeProjectMedia(project: Project): Promise<Project> {
  const [coverPhotoUri, logoUri] = await Promise.all([
    materializeCloudRef(project.coverPhotoCloudRef, project.coverPhotoUri),
    materializeCloudRef(project.logoCloudRef, project.logoUri),
  ]);
  return coverPhotoUri === project.coverPhotoUri && logoUri === project.logoUri
    ? project
    : { ...project, coverPhotoUri, logoUri };
}

async function materializeAssetMedia(asset: PhotoAsset): Promise<PhotoAsset> {
  const [originalUri, reportUri, thumbUri, annotatedUri] = await Promise.all([
    materializeCloudRef(asset.originalCloudRef, asset.originalUri),
    materializeCloudRef(asset.reportCloudRef, asset.reportUri),
    materializeCloudRef(asset.thumbCloudRef, asset.thumbUri),
    materializeCloudRef(asset.annotatedCloudRef, asset.annotatedUri),
  ]);
  if (
    originalUri === asset.originalUri &&
    reportUri === asset.reportUri &&
    thumbUri === asset.thumbUri &&
    annotatedUri === asset.annotatedUri
  ) return asset;
  return {
    ...asset,
    originalUri: originalUri ?? asset.originalUri,
    reportUri: reportUri ?? asset.reportUri,
    thumbUri: thumbUri ?? asset.thumbUri,
    annotatedUri,
  };
}

async function materializeReportMedia(report: ReportExport): Promise<ReportExport> {
  const pdfUri = await materializeCloudRef(report.pdfCloudRef, report.pdfUri);
  const nextPdfUri = pdfUri ?? report.pdfUri;
  return nextPdfUri === report.pdfUri ? report : { ...report, pdfUri: nextPdfUri };
}

async function refreshMaterializedMedia(db: Db, settings: AppSettings): Promise<{ db: Db; settings: AppSettings }> {
  const [projects, assets, reports, logoUri] = await Promise.all([
    Promise.all(db.projects.map(materializeProjectMedia)),
    Promise.all(db.assets.map(materializeAssetMedia)),
    Promise.all(db.reports.map(materializeReportMedia)),
    materializeCloudRef(settings.logoCloudRef, settings.logoUri),
  ]);
  return {
    db: { ...db, projects, assets, reports },
    settings:
      (logoUri ?? settings.logoUri) === settings.logoUri
        ? settings
        : { ...settings, logoUri: logoUri ?? settings.logoUri },
  };
}

function matchingLocalMediaUri(
  currentCloudRef: string | null | undefined,
  currentUri: string | null | undefined,
  remoteCloudRef: string | null,
): string | null | undefined {
  const effectiveCurrentRef = currentCloudRef ?? (isSupabaseRef(currentUri) ? currentUri : null);
  return effectiveCurrentRef === remoteCloudRef ? currentUri : undefined;
}

async function pullSimple<TRow extends { id: string; updated_at: string }, TLocal extends VersionedRecord>(
  queryPage: PageFetcher<TRow>,
  sinceIso: string,
  list: TLocal[],
  fromRow: (row: TRow) => TLocal,
): Promise<{ list: TLocal[]; pulled: number }> {
  const rows = await fetchChangedRows(queryPage, sinceIso);
  return mergeRemoteIntoLocal(list, rows.map(fromRow));
}

async function pullProjects(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const existing = new Map(db.projects.map((project) => [project.id, project]));
  const rows = await fetchChangedRows<Tables["projects"]["Row"]>(
    (since, from, to) =>
      supabase.from("projects").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
    sinceIso,
  );
  const mapped = await Promise.all(
    rows.map(async (row) => {
      const local = existing.get(row.id);
      const remoteCoverRef = row.cover_bucket && row.cover_path ? toSupabaseRef(row.cover_bucket, row.cover_path) : null;
      const remoteLogoRef = row.logo_bucket && row.logo_path ? toSupabaseRef(row.logo_bucket, row.logo_path) : null;
      return materializeProjectMedia(
        projectFromRow(row, {
          coverPhotoUri:
            matchingLocalMediaUri(local?.coverPhotoCloudRef, local?.coverPhotoUri, remoteCoverRef) ?? null,
          logoUri: matchingLocalMediaUri(local?.logoCloudRef, local?.logoUri, remoteLogoRef) ?? null,
        }),
      );
    }),
  );
  const { list, pulled } = mergeRemoteIntoLocal(db.projects, mapped);
  return { db: { ...db, projects: list }, pulled };
}

async function pullLocations(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["project_locations"]["Row"], Db["locations"][number]>(
    (since, from, to) =>
      supabase
        .from("project_locations")
        .select("*")
        .eq("owner_id", ownerId)
        .gt("updated_at", since)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    sinceIso,
    db.locations,
    locationFromRow,
  );
  return { db: { ...db, locations: list }, pulled };
}

async function pullAssignees(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["assignees"]["Row"], Db["assignees"][number]>(
    (since, from, to) =>
      supabase.from("assignees").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
    sinceIso,
    db.assignees,
    assigneeFromRow,
  );
  return { db: { ...db, assignees: list }, pulled };
}

async function pullAudits(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["audits"]["Row"], Db["audits"][number]>(
    (since, from, to) =>
      supabase.from("audits").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
    sinceIso,
    db.audits,
    auditFromRow,
  );
  return { db: { ...db, audits: list }, pulled };
}

async function pullIssues(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["issues"]["Row"], Db["issues"][number]>(
    (since, from, to) =>
      supabase.from("issues").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
    sinceIso,
    db.issues,
    issueFromRow,
  );
  return { db: { ...db, issues: list }, pulled };
}

async function pullAnnotations(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["annotation_records"]["Row"], Db["annotations"][number]>(
    (since, from, to) =>
      supabase
        .from("annotation_records")
        .select("*")
        .eq("owner_id", ownerId)
        .gt("updated_at", since)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    sinceIso,
    db.annotations,
    annotationFromRow,
  );
  return { db: { ...db, annotations: list }, pulled };
}

async function pullAssets(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const rows = await fetchChangedRows<Tables["photo_assets"]["Row"]>(
    (since, from, to) =>
      supabase.from("photo_assets").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
    sinceIso,
  );
  if (rows.length === 0) return { db, pulled: 0 };
  const existingById = new Map(db.assets.map((a) => [a.id, a]));
  const mapped = await Promise.all(rows.map(async (row) => {
    const existing = existingById.get(row.id);
    const remoteOriginalRef = row.original_bucket && row.original_path ? toSupabaseRef(row.original_bucket, row.original_path) : null;
    const remoteReportRef = row.report_bucket && row.report_path ? toSupabaseRef(row.report_bucket, row.report_path) : null;
    const remoteThumbRef = row.thumb_bucket && row.thumb_path ? toSupabaseRef(row.thumb_bucket, row.thumb_path) : null;
    const remoteAnnotatedRef = row.annotated_bucket && row.annotated_path ? toSupabaseRef(row.annotated_bucket, row.annotated_path) : null;
    return materializeAssetMedia(photoAssetFromRow(row, {
      originalUri: matchingLocalMediaUri(existing?.originalCloudRef, existing?.originalUri, remoteOriginalRef) ?? undefined,
      reportUri: matchingLocalMediaUri(existing?.reportCloudRef, existing?.reportUri, remoteReportRef) ?? undefined,
      thumbUri: matchingLocalMediaUri(existing?.thumbCloudRef, existing?.thumbUri, remoteThumbRef) ?? undefined,
      annotatedUri: matchingLocalMediaUri(existing?.annotatedCloudRef, existing?.annotatedUri, remoteAnnotatedRef),
    }));
  }));
  const { list, pulled } = mergeRemoteIntoLocal(db.assets, mapped);
  return { db: { ...db, assets: list }, pulled };
}

async function pullReports(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const rows = await fetchChangedRows<Tables["report_exports"]["Row"]>(
    (since, from, to) =>
      supabase.from("report_exports").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
    sinceIso,
  );
  if (rows.length === 0) return { db, pulled: 0 };
  const existingById = new Map(db.reports.map((r) => [r.id, r]));
  const mapped = await Promise.all(
    rows.map((row) => {
      const existing = existingById.get(row.id);
      const remotePdfRef = row.pdf_bucket && row.pdf_path ? toSupabaseRef(row.pdf_bucket, row.pdf_path) : null;
      const localPdfUri = matchingLocalMediaUri(existing?.pdfCloudRef, existing?.pdfUri, remotePdfRef) ?? undefined;
      return materializeReportMedia(reportExportFromRow(row, localPdfUri));
    }),
  );
  const { list, pulled } = mergeRemoteIntoLocal(db.reports, mapped);
  return { db: { ...db, reports: list }, pulled };
}

async function pullTable(supabase: SupabaseClientT, table: PushTableName, ownerId: string, sinceIso: string, db: Db) {
  switch (table) {
    case "projects":
      return pullProjects(supabase, ownerId, sinceIso, db);
    case "locations":
      return pullLocations(supabase, ownerId, sinceIso, db);
    case "assignees":
      return pullAssignees(supabase, ownerId, sinceIso, db);
    case "audits":
      return pullAudits(supabase, ownerId, sinceIso, db);
    case "issues":
      return pullIssues(supabase, ownerId, sinceIso, db);
    case "assets":
      return pullAssets(supabase, ownerId, sinceIso, db);
    case "annotations":
      return pullAnnotations(supabase, ownerId, sinceIso, db);
    case "reports":
      return pullReports(supabase, ownerId, sinceIso, db);
  }
}

const PULL_ORDER: PushTableName[] = ["projects", "locations", "assignees", "audits", "issues", "assets", "annotations", "reports"];

function inferLegacyCloudOwners(db: Db, settings: AppSettings): Set<string> {
  const owners = new Set<string>();
  const add = (value: string | null | undefined) => {
    const parsed = parseSupabaseRef(value);
    const owner = parsed?.path.split("/")[0];
    if (owner) owners.add(owner);
  };
  add(settings.logoCloudRef ?? settings.logoUri);
  for (const project of db.projects) {
    add(project.coverPhotoCloudRef ?? project.coverPhotoUri);
    add(project.logoCloudRef ?? project.logoUri);
  }
  for (const asset of db.assets) {
    add(asset.originalCloudRef ?? asset.originalUri);
    add(asset.reportCloudRef ?? asset.reportUri);
    add(asset.thumbCloudRef ?? asset.thumbUri);
    add(asset.annotatedCloudRef ?? asset.annotatedUri);
  }
  for (const report of db.reports) add(report.pdfCloudRef ?? report.pdfUri);
  return owners;
}

/** Remove only the exact bundled SAMPLE graph when an established account is opened on a fresh device. */
function stripBundledDemo(db: Db): { db: Db; changedTables: (keyof Db)[] } {
  const sampleProjectIds = new Set(
    db.projects
      .filter(
        (project) =>
          project.reference === "HVA-ST2-2026" &&
          project.name === "Sample — Harbourview Apartments Stage 2",
      )
      .map((project) => project.id),
  );
  if (sampleProjectIds.size === 0) return { db, changedTables: [] };

  const sampleAuditIds = new Set(
    db.audits.filter((audit) => sampleProjectIds.has(audit.projectId)).map((audit) => audit.id),
  );
  const sampleIssueIds = new Set(
    db.issues.filter((issue) => sampleProjectIds.has(issue.projectId)).map((issue) => issue.id),
  );
  const sampleAssetIds = new Set(
    db.assets.filter((asset) => sampleProjectIds.has(asset.projectId)).map((asset) => asset.id),
  );
  const sampleAnnotationIds = new Set(
    db.annotations
      .filter((annotation) => sampleIssueIds.has(annotation.issueId) || sampleAssetIds.has(annotation.assetId))
      .map((annotation) => annotation.id),
  );
  const sampleReportIds = new Set(
    db.reports.filter((report) => sampleProjectIds.has(report.projectId)).map((report) => report.id),
  );
  const sampleAssigneeIds = new Set(
    db.issues
      .filter((issue) => sampleIssueIds.has(issue.id) && issue.assigneeId)
      .map((issue) => issue.assigneeId as string),
  );
  const remainingIssues = db.issues.filter((issue) => !sampleIssueIds.has(issue.id));
  const assigneeIdsStillUsed = new Set(
    remainingIssues.map((issue) => issue.assigneeId).filter((id): id is string => Boolean(id)),
  );
  const removableAssigneeIds = new Set(
    Array.from(sampleAssigneeIds).filter((id) => !assigneeIdsStillUsed.has(id)),
  );

  const removedIds = new Set<string>([
    ...sampleProjectIds,
    ...sampleAuditIds,
    ...sampleIssueIds,
    ...sampleAssetIds,
    ...sampleAnnotationIds,
    ...sampleReportIds,
    ...removableAssigneeIds,
  ]);
  const next: Db = {
    projects: db.projects.filter((project) => !sampleProjectIds.has(project.id)),
    locations: db.locations.filter((location) => !sampleProjectIds.has(location.projectId)),
    assignees: db.assignees.filter((assignee) => !removableAssigneeIds.has(assignee.id)),
    audits: db.audits.filter((audit) => !sampleAuditIds.has(audit.id)),
    issues: remainingIssues,
    assets: db.assets.filter((asset) => !sampleAssetIds.has(asset.id)),
    annotations: db.annotations.filter((annotation) => !sampleAnnotationIds.has(annotation.id)),
    reports: db.reports.filter((report) => !sampleReportIds.has(report.id)),
    outbox: db.outbox.filter((entry) => !removedIds.has(entry.recordId)),
  };
  const changedTables = (Object.keys(next) as (keyof Db)[]).filter((table) => next[table] !== db[table]);
  return { db: next, changedTables };
}

/**
 * A "conflict" resolution can keep the *local* content (when the local edit
 * was the more recent one) — but it still needs to reach the server to
 * converge. Since that record's outbox entry may already have been removed
 * by an earlier successful push this same cycle, re-queue anything left
 * flagged `syncStatus: "conflict"` so the next push retries it.
 */
function requeueConflicts(db: Db): { db: Db; changed: boolean } {
  const existingKeys = new Set(db.outbox.map((e) => `${e.table}\u0000${e.recordId}`));
  const additions: OutboxEntry[] = [];
  const at = nowIso();
  for (const table of PUSH_TABLE_ORDER) {
    const records = db[table] as readonly { id: string; syncStatus: string }[];
    for (const record of records) {
      if (record.syncStatus === "conflict" && !existingKeys.has(`${table}\u0000${record.id}`)) {
        additions.push({ id: newId(), table, recordId: record.id, op: "update", at, updatedAt: at });
      }
    }
  }
  if (additions.length === 0) return { db, changed: false };
  return { db: { ...db, outbox: appendOutbox(db.outbox, additions) }, changed: true };
}

/* ----------------------------------------- Settings ----------------------------------------- */

function hasMeaningfulRemoteSettings(row: Tables["user_settings"]["Row"]): boolean {
  return Boolean(
    row.local_import_completed_at ||
      row.inspector_name ||
      row.company_name ||
      row.logo_path ||
      row.report_footer_text ||
      row.last_audit_id,
  );
}

async function syncSettings(
  supabase: SupabaseClientT,
  ownerId: string,
  settings: AppSettings,
  preferRemote: boolean,
): Promise<{ settings: AppSettings; remoteEstablished: boolean; error?: string }> {
  let working = settings;
  let remoteEstablished = false;
  try {
    const { data, error } = await supabase.from("user_settings").select("*").eq("owner_id", ownerId).maybeSingle();
    if (error) throw error;
    if (data) {
      let remoteHasProject = false;
      if (preferRemote) {
        const projectProbe = await supabase.from("projects").select("id").eq("owner_id", ownerId).limit(1);
        if (projectProbe.error) throw projectProbe.error;
        remoteHasProject = (projectProbe.data?.length ?? 0) > 0;
      }
      remoteEstablished = remoteHasProject || hasMeaningfulRemoteSettings(data);
      if (preferRemote && remoteEstablished) {
        const remote = appSettingsFromRow(data);
        working = {
          ...remote,
          cloudAccountId: ownerId,
          cloudLastPulledAt: settings.cloudLastPulledAt,
          cloudImportCompletedAt: settings.cloudImportCompletedAt,
          cloudImportCheckpoint: settings.cloudImportCheckpoint,
        };
      }
    }
  } catch (e) {
    return { settings: working, remoteEstablished, error: classifySyncError(e).message };
  }

  if (needsUpload(working.logoUri) && !working.logoCloudRef) {
    const dest = buildAccountLogoPath(ownerId, working.logoUri);
    const outcome = await uploadLocalMedia(supabase, dest, working.logoUri as string);
    if (outcome.ok) {
      working = { ...working, logoCloudRef: toSupabaseRef(dest.bucket, dest.path) };
    } else if (outcome.error) {
      return { settings: working, remoteEstablished, error: outcome.error };
    }
  }

  working = {
    ...working,
    logoUri: (await materializeCloudRef(working.logoCloudRef, working.logoUri)) ?? working.logoUri,
  };

  const { error } = await supabase.from("user_settings").upsert(appSettingsToRow(working, ownerId), { onConflict: "owner_id" });
  if (error) return { settings: working, remoteEstablished, error: classifySyncError(error).message };
  return { settings: working, remoteEstablished };
}

/* --------------------------------------- Checkpoints --------------------------------------- */

async function touchCheckpoint(supabase: SupabaseClientT, ownerId: string, at: string): Promise<void> {
  try {
    const touchedAt = nowIso();
    await supabase.from("sync_checkpoints").upsert(
      { owner_id: ownerId, last_pulled_at: at, last_push_at: touchedAt, updated_at: touchedAt },
      { onConflict: "owner_id" },
    );
  } catch (e) {
    console.log("[syncEngine] checkpoint upsert failed", e);
  }
}

/* ---------------------------------------- Entry point ---------------------------------------- */

async function runSyncCycleOnce(): Promise<SyncCycleResult> {
  const result = emptyResult();
  result.configured = isSupabaseConfigured();
  if (!result.configured) {
    result.errors.push("Cloud sync isn't configured for this build yet.");
    return result;
  }

  let supabase: SupabaseClientT;
  try {
    supabase = await getSupabase();
  } catch (e) {
    result.errors.push(classifySyncError(e).message);
    return result;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    result.errors.push("Sign in to sync your projects and photos to the cloud.");
    return result;
  }
  result.authenticated = true;
  const ownerId = session.user.id;

  try {
    let db: Db = await loadDb();
    let settings: AppSettings = await loadSettings();
    const dirtyTables = new Set<keyof Db>();

    if (settings.cloudAccountId && settings.cloudAccountId !== ownerId) {
      result.errors.push(
        "This device's local data is linked to a different cloud account. Clear local data before signing in with another account.",
      );
      return result;
    }
    if (!settings.cloudAccountId) {
      const legacyOwners = inferLegacyCloudOwners(db, settings);
      if (legacyOwners.size > 0 && (legacyOwners.size !== 1 || !legacyOwners.has(ownerId))) {
        result.errors.push(
          "This device contains cloud media linked to another account. Clear local data before signing in with this account.",
        );
        return result;
      }
    }
    const newlyBound = !settings.cloudAccountId;
    settings = { ...settings, cloudAccountId: ownerId };

    // Persist ownership before making any cloud write. If the process is
    // interrupted mid-cycle, a later sign-in cannot silently redirect this
    // local database into a different account.
    if (newlyBound) {
      const bindingSave = await saveSettings(settings);
      if (!bindingSave.ok) {
        result.errors.push(bindingSave.error);
        return result;
      }
    }

    const settingsOutcome = await syncSettings(supabase, ownerId, settings, newlyBound);
    settings = settingsOutcome.settings;
    if (settingsOutcome.error) {
      result.errors.push(settingsOutcome.error);
      if (newlyBound) return result;
    }

    if (newlyBound && settingsOutcome.remoteEstablished) {
      const stripped = stripBundledDemo(db);
      db = stripped.db;
      stripped.changedTables.forEach((table) => dirtyTables.add(table));
    }

    const materialized = await refreshMaterializedMedia(db, settings);
    if (materialized.db.projects.some((record, index) => record !== db.projects[index])) dirtyTables.add("projects");
    if (materialized.db.assets.some((record, index) => record !== db.assets[index])) dirtyTables.add("assets");
    if (materialized.db.reports.some((record, index) => record !== db.reports[index])) dirtyTables.add("reports");
    db = materialized.db;
    settings = materialized.settings;

    // ---- One-time local → cloud import (first sync after sign-in) ----
    if (detectNeedsImport(settings, db)) {
      const batch = buildImportOutboxBatch(db, settings.cloudImportCheckpoint);
      db = { ...db, outbox: appendOutbox(db.outbox, batch.entries) };
      settings = {
        ...settings,
        cloudImportCheckpoint: batch.checkpoint,
      };
      if (batch.entries.length > 0) dirtyTables.add("outbox");
    } else if (
      newlyBound &&
      !settings.cloudImportCompletedAt &&
      !PUSH_TABLE_ORDER.some((table) => db[table].length > 0)
    ) {
      settings = { ...settings, ...markImportCompleted() };
    }

    // ---- Push ----
    const originalOutboxLength = db.outbox.length;
    const compacted = compactOutbox(db.outbox);
    const ordered = sortOutboxForPush(compacted);
    const remaining: OutboxEntry[] = [];
    let authFailed = false;

    for (const entry of ordered) {
      if (authFailed) {
        remaining.push(entry);
        continue;
      }
      if (!isPushTableName(entry.table)) continue; // drop entries for tables sync doesn't know about
      const table = entry.table;

      let outcome: PushOutcome;
      try {
        outcome = await pushOne(supabase, table, entry.recordId, db, ownerId);
      } catch (e) {
        outcome = { ok: false, error: classifySyncError(e) };
      }

      if (outcome.ok) {
        db = outcome.db;
        dirtyTables.add(table);
        result.pushed += 1;
        result.mediaUploaded += outcome.mediaUploaded ?? 0;
        result.mediaSkipped += outcome.mediaSkipped ?? 0;
        if (outcome.pending) {
          remaining.push(entry);
          result.pushFailed += 1;
          result.errors.push(outcome.warning ?? "Some media is still waiting to upload.");
        }
      } else {
        remaining.push(entry);
        result.pushFailed += 1;
        result.errors.push(outcome.error.message);
        if (outcome.error.errorClass === "auth") authFailed = true;
      }
    }
    if (remaining.length !== compacted.length || compacted.length !== originalOutboxLength) {
      db = { ...db, outbox: remaining };
      dirtyTables.add("outbox");
    }

    // ---- Pull ----
    if (!authFailed) {
      try {
        // Keep an overlap window so writes committed while tables are being
        // pulled cannot fall into the checkpoint race. Merge is idempotent.
        const nextCheckpoint = new Date(Date.now() - 5 * 60 * 1_000).toISOString();
        const sinceIso = settings.cloudLastPulledAt ?? EPOCH_ISO;
        for (const table of PULL_ORDER) {
          const { db: nextDb, pulled } = await pullTable(supabase, table, ownerId, sinceIso, db);
          db = nextDb;
          if (pulled > 0) {
            dirtyTables.add(table);
            result.pulled += pulled;
          }
        }
        await touchCheckpoint(supabase, ownerId, nextCheckpoint);
        settings = { ...settings, cloudLastPulledAt: nextCheckpoint };
      } catch (e) {
        result.errors.push(classifySyncError(e).message);
      }
    }

    const requeue = requeueConflicts(db);
    db = requeue.db;
    if (requeue.changed) dirtyTables.add("outbox");

    const importQueueEmpty = !db.outbox.some((entry) => isPushTableName(entry.table));
    if (!settings.cloudImportCompletedAt && isImportComplete(settings.cloudImportCheckpoint) && importQueueEmpty) {
      settings = { ...settings, ...markImportCompleted(), cloudAccountId: ownerId };
    }

    // ---- Persist ----
    if (dirtyTables.size > 0) {
      const saveResult = await saveDb(db, Array.from(dirtyTables));
      if (!saveResult.ok) result.errors.push(saveResult.error);
    }
    const settingsSaveResult = await saveSettings(settings);
    if (!settingsSaveResult.ok) result.errors.push(settingsSaveResult.error);

    result.ok = !authFailed && result.pushFailed === 0 && result.errors.length === 0;
    return result;
  } catch (e) {
    result.errors.push(classifySyncError(e).message);
    return result;
  }
}

let activeSyncCycle: Promise<SyncCycleResult> | null = null;

/** Single-flight entry point so foreground, timer, reconnect and manual sync cannot race local outbox persistence. */
export function runSyncCycle(): Promise<SyncCycleResult> {
  if (activeSyncCycle) return activeSyncCycle;
  activeSyncCycle = runSyncCycleOnce().finally(() => {
    activeSyncCycle = null;
  });
  return activeSyncCycle;
}

export const syncEngineInternals = {
  versionCheckedWrite,
  fetchChangedRows,
  stripBundledDemo,
  matchingLocalMediaUri,
  inferLegacyCloudOwners,
};
