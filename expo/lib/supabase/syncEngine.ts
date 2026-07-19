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
import {
  buildAccountLogoPath,
  buildPhotoAssetPath,
  buildProjectCoverPath,
  buildProjectLogoPath,
  buildReportExportPath,
  needsUpload,
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
  if (Platform.OS === "web") {
    return {
      ok: false,
      skipped: true,
      error: "Binary upload from a web build isn't supported yet — it will upload next time this account syncs from the mobile app.",
    };
  }
  try {
    const bytes = await readFileAsBytes(localUri);
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
  | { ok: true; db: Db; mediaUploaded?: number; mediaSkipped?: number }
  | { ok: false; error: ClassifiedSyncError };

interface UpsertResponse {
  data: { server_version: number } | null;
  error: { message: string; code?: string; status?: number } | null;
}

async function pushSimple<TLocal extends VersionedRecord>(
  upsert: (row: unknown) => PromiseLike<unknown>,
  list: TLocal[],
  recordId: string,
  toRow: (local: TLocal, ownerId: string) => unknown,
  ownerId: string,
): Promise<{ ok: true; list: TLocal[] } | { ok: false; error: ClassifiedSyncError }> {
  const record = list.find((r) => r.id === recordId);
  if (!record) return { ok: true, list };

  const response = (await upsert(toRow(record, ownerId))) as UpsertResponse;
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
    (row) =>
      supabase
        .from("project_locations")
        .upsert(row as Tables["project_locations"]["Insert"], { onConflict: "id" })
        .select("server_version")
        .single(),
    db.locations,
    recordId,
    locationToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, locations: result.list } } : result;
}

async function pushAssignee(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row) =>
      supabase
        .from("assignees")
        .upsert(row as Tables["assignees"]["Insert"], { onConflict: "id" })
        .select("server_version")
        .single(),
    db.assignees,
    recordId,
    assigneeToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, assignees: result.list } } : result;
}

async function pushAudit(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row) =>
      supabase
        .from("audits")
        .upsert(row as Tables["audits"]["Insert"], { onConflict: "id" })
        .select("server_version")
        .single(),
    db.audits,
    recordId,
    auditToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, audits: result.list } } : result;
}

async function pushIssue(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row) =>
      supabase
        .from("issues")
        .upsert(row as Tables["issues"]["Insert"], { onConflict: "id" })
        .select("server_version")
        .single(),
    db.issues,
    recordId,
    issueToRow,
    ownerId,
  );
  return result.ok ? { ok: true, db: { ...db, issues: result.list } } : result;
}

async function pushAnnotation(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const result = await pushSimple(
    (row) =>
      supabase
        .from("annotation_records")
        .upsert(row as Tables["annotation_records"]["Insert"], { onConflict: "id" })
        .select("server_version")
        .single(),
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

  if (needsUpload(working.coverPhotoUri)) {
    const dest = buildProjectCoverPath(ownerId, working.id, working.coverPhotoUri);
    const outcome = await uploadLocalMedia(supabase, dest, working.coverPhotoUri as string);
    if (outcome.ok) {
      working = { ...working, coverPhotoUri: toSupabaseRef(dest.bucket, dest.path) };
      mediaUploaded += 1;
    } else if (outcome.skipped) {
      mediaSkipped += 1;
    }
  }
  if (needsUpload(working.logoUri)) {
    const dest = buildProjectLogoPath(ownerId, working.id, working.logoUri);
    const outcome = await uploadLocalMedia(supabase, dest, working.logoUri as string);
    if (outcome.ok) {
      working = { ...working, logoUri: toSupabaseRef(dest.bucket, dest.path) };
      mediaUploaded += 1;
    } else if (outcome.skipped) {
      mediaSkipped += 1;
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .upsert(projectToRow(working, ownerId), { onConflict: "id" })
    .select("server_version")
    .single();
  if (error) return { ok: false, error: classifySyncError(error) };

  const stillPendingMedia = needsUpload(working.coverPhotoUri) || needsUpload(working.logoUri);
  const nextRecord: Project = {
    ...working,
    syncStatus: stillPendingMedia ? "pending_upload" : "synced",
    serverVersion: data?.server_version ?? working.serverVersion,
  };
  const projects = db.projects.map((p) => (p.id === recordId ? nextRecord : p));
  return { ok: true, db: { ...db, projects }, mediaUploaded, mediaSkipped };
}

async function pushAsset(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const record = db.assets.find((a) => a.id === recordId);
  if (!record) return { ok: true, db };

  let working: PhotoAsset = record;
  let mediaUploaded = 0;
  let mediaSkipped = 0;

  const variants: Array<[PhotoAssetVariant, string | null]> = [
    ["original", working.originalUri],
    ["report", working.reportUri],
    ["thumb", working.thumbUri],
    ["annotated", working.annotatedUri],
  ];

  for (const [variant, uri] of variants) {
    if (!needsUpload(uri)) continue;
    const dest = buildPhotoAssetPath(ownerId, working.projectId, working.issueId, working.id, variant, uri);
    const outcome = await uploadLocalMedia(supabase, dest, uri as string);
    if (outcome.ok) {
      const ref = toSupabaseRef(dest.bucket, dest.path);
      working =
        variant === "original"
          ? { ...working, originalUri: ref }
          : variant === "report"
            ? { ...working, reportUri: ref }
            : variant === "thumb"
              ? { ...working, thumbUri: ref }
              : { ...working, annotatedUri: ref };
      mediaUploaded += 1;
    } else if (outcome.skipped) {
      mediaSkipped += 1;
    }
  }

  const { data, error } = await supabase
    .from("photo_assets")
    .upsert(photoAssetToRow(working, ownerId), { onConflict: "id" })
    .select("server_version")
    .single();
  if (error) return { ok: false, error: classifySyncError(error) };

  const stillPending =
    needsUpload(working.originalUri) ||
    needsUpload(working.reportUri) ||
    needsUpload(working.thumbUri) ||
    needsUpload(working.annotatedUri);
  const nextRecord: PhotoAsset = {
    ...working,
    syncStatus: stillPending ? "pending_upload" : "synced",
    serverVersion: data?.server_version ?? working.serverVersion,
  };
  const assets = db.assets.map((a) => (a.id === recordId ? nextRecord : a));
  return { ok: true, db: { ...db, assets }, mediaUploaded, mediaSkipped };
}

async function pushReport(supabase: SupabaseClientT, recordId: string, db: Db, ownerId: string): Promise<PushOutcome> {
  const record = db.reports.find((r) => r.id === recordId);
  if (!record) return { ok: true, db };

  let working: ReportExport = record;
  let mediaUploaded = 0;
  let mediaSkipped = 0;

  if (needsUpload(working.pdfUri)) {
    const dest = buildReportExportPath(ownerId, working.auditId, working.id);
    const outcome = await uploadLocalMedia(supabase, dest, working.pdfUri);
    if (outcome.ok) {
      working = { ...working, pdfUri: toSupabaseRef(dest.bucket, dest.path) };
      mediaUploaded += 1;
    } else if (outcome.skipped) {
      mediaSkipped += 1;
    }
  }

  const { data, error } = await supabase
    .from("report_exports")
    .upsert(reportExportToRow(working, ownerId), { onConflict: "id" })
    .select("server_version")
    .single();
  if (error) return { ok: false, error: classifySyncError(error) };

  const nextRecord: ReportExport = {
    ...working,
    syncStatus: needsUpload(working.pdfUri) ? "pending_upload" : "synced",
    serverVersion: data?.server_version ?? working.serverVersion,
  };
  const reports = db.reports.map((r) => (r.id === recordId ? nextRecord : r));
  return { ok: true, db: { ...db, reports }, mediaUploaded, mediaSkipped };
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

type PageFetcher<TRow> = (sinceIso: string) => PromiseLike<{ data: TRow[] | null; error: { message: string } | null }>;

async function fetchChangedRows<TRow extends { updated_at: string }>(
  queryPage: PageFetcher<TRow>,
  sinceIso: string,
): Promise<TRow[]> {
  const rows: TRow[] = [];
  let cursor = sinceIso;
  for (;;) {
    const { data, error } = await queryPage(cursor);
    if (error) throw error;
    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1]!.updated_at;
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
  const { list, pulled } = await pullSimple<Tables["projects"]["Row"], Project>(
    (since) =>
      supabase.from("projects").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).limit(PAGE_SIZE),
    sinceIso,
    db.projects,
    projectFromRow,
  );
  return { db: { ...db, projects: list }, pulled };
}

async function pullLocations(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["project_locations"]["Row"], Db["locations"][number]>(
    (since) =>
      supabase
        .from("project_locations")
        .select("*")
        .eq("owner_id", ownerId)
        .gt("updated_at", since)
        .order("updated_at", { ascending: true })
        .limit(PAGE_SIZE),
    sinceIso,
    db.locations,
    locationFromRow,
  );
  return { db: { ...db, locations: list }, pulled };
}

async function pullAssignees(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["assignees"]["Row"], Db["assignees"][number]>(
    (since) =>
      supabase.from("assignees").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).limit(PAGE_SIZE),
    sinceIso,
    db.assignees,
    assigneeFromRow,
  );
  return { db: { ...db, assignees: list }, pulled };
}

async function pullAudits(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["audits"]["Row"], Db["audits"][number]>(
    (since) =>
      supabase.from("audits").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).limit(PAGE_SIZE),
    sinceIso,
    db.audits,
    auditFromRow,
  );
  return { db: { ...db, audits: list }, pulled };
}

async function pullIssues(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["issues"]["Row"], Db["issues"][number]>(
    (since) =>
      supabase.from("issues").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).limit(PAGE_SIZE),
    sinceIso,
    db.issues,
    issueFromRow,
  );
  return { db: { ...db, issues: list }, pulled };
}

async function pullAnnotations(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const { list, pulled } = await pullSimple<Tables["annotation_records"]["Row"], Db["annotations"][number]>(
    (since) =>
      supabase
        .from("annotation_records")
        .select("*")
        .eq("owner_id", ownerId)
        .gt("updated_at", since)
        .order("updated_at", { ascending: true })
        .limit(PAGE_SIZE),
    sinceIso,
    db.annotations,
    annotationFromRow,
  );
  return { db: { ...db, annotations: list }, pulled };
}

async function pullAssets(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const rows = await fetchChangedRows<Tables["photo_assets"]["Row"]>(
    (since) =>
      supabase.from("photo_assets").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).limit(PAGE_SIZE),
    sinceIso,
  );
  if (rows.length === 0) return { db, pulled: 0 };
  const existingById = new Map(db.assets.map((a) => [a.id, a]));
  const mapped = rows.map((row) => {
    const existing = existingById.get(row.id);
    return photoAssetFromRow(row, {
      originalUri: existing?.originalUri,
      reportUri: existing?.reportUri,
      thumbUri: existing?.thumbUri,
      annotatedUri: existing?.annotatedUri ?? undefined,
    });
  });
  const { list, pulled } = mergeRemoteIntoLocal(db.assets, mapped);
  return { db: { ...db, assets: list }, pulled };
}

async function pullReports(supabase: SupabaseClientT, ownerId: string, sinceIso: string, db: Db) {
  const rows = await fetchChangedRows<Tables["report_exports"]["Row"]>(
    (since) =>
      supabase.from("report_exports").select("*").eq("owner_id", ownerId).gt("updated_at", since).order("updated_at", { ascending: true }).limit(PAGE_SIZE),
    sinceIso,
  );
  if (rows.length === 0) return { db, pulled: 0 };
  const existingById = new Map(db.reports.map((r) => [r.id, r]));
  const mapped = rows.map((row) => reportExportFromRow(row, existingById.get(row.id)?.pdfUri));
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
    const records = db[table] as ReadonlyArray<{ id: string; syncStatus: string }>;
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

/**
 * Settings have no per-record version history (unlike the table rows
 * above), so there's no reliable way to detect a true conflict. Instead:
 * this device's user-facing fields (inspector name, footer text, etc.)
 * always win and get pushed as-is — but the one-time cloud-import
 * bookkeeping (`cloudImportCompletedAt` / `cloudImportCheckpoint`) is
 * merged in from whichever device is furthest along, so import progress
 * converges correctly across devices.
 */
function mergeCloudImportBookkeeping(local: AppSettings, remoteRow: Tables["user_settings"]["Row"]): AppSettings {
  if (local.cloudImportCompletedAt) return local;
  if (remoteRow.local_import_completed_at) {
    return { ...local, cloudImportCompletedAt: remoteRow.local_import_completed_at, cloudImportCheckpoint: null };
  }
  const remoteCheckpoint = remoteRow.local_import_checkpoint;
  if (remoteCheckpoint && typeof remoteCheckpoint === "object" && !Array.isArray(remoteCheckpoint)) {
    const merged: Record<string, boolean> = { ...(local.cloudImportCheckpoint ?? {}) };
    let any = false;
    for (const [key, value] of Object.entries(remoteCheckpoint as Record<string, unknown>)) {
      if (value === true) {
        merged[key] = true;
        any = true;
      }
    }
    if (any) return { ...local, cloudImportCheckpoint: merged };
  }
  return local;
}

async function syncSettings(supabase: SupabaseClientT, ownerId: string, settings: AppSettings): Promise<{ settings: AppSettings; error?: string }> {
  let working = settings;
  try {
    const { data } = await supabase.from("user_settings").select("*").eq("owner_id", ownerId).maybeSingle();
    if (data) working = mergeCloudImportBookkeeping(working, data);
  } catch (e) {
    // A failed pull shouldn't block pushing this device's settings.
    console.log("[syncEngine] settings pull failed", e);
  }

  if (needsUpload(working.logoUri)) {
    const dest = buildAccountLogoPath(ownerId, working.logoUri);
    const outcome = await uploadLocalMedia(supabase, dest, working.logoUri as string);
    if (outcome.ok) {
      working = { ...working, logoUri: toSupabaseRef(dest.bucket, dest.path) };
    }
  }

  const { error } = await supabase.from("user_settings").upsert(appSettingsToRow(working, ownerId), { onConflict: "owner_id" });
  if (error) return { settings: working, error: classifySyncError(error).message };
  return { settings: working };
}

/* --------------------------------------- Checkpoints --------------------------------------- */

async function fetchLastPulledAt(supabase: SupabaseClientT, ownerId: string): Promise<string> {
  try {
    const { data } = await supabase.from("sync_checkpoints").select("last_pulled_at").eq("owner_id", ownerId).maybeSingle();
    return data?.last_pulled_at ?? EPOCH_ISO;
  } catch {
    return EPOCH_ISO;
  }
}

async function touchCheckpoint(supabase: SupabaseClientT, ownerId: string): Promise<void> {
  const at = nowIso();
  try {
    await supabase.from("sync_checkpoints").upsert(
      { owner_id: ownerId, last_pulled_at: at, last_push_at: at, updated_at: at },
      { onConflict: "owner_id" },
    );
  } catch (e) {
    console.log("[syncEngine] checkpoint upsert failed", e);
  }
}

/* ---------------------------------------- Entry point ---------------------------------------- */

export async function runSyncCycle(): Promise<SyncCycleResult> {
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

    // ---- One-time local → cloud import (first sync after sign-in) ----
    if (detectNeedsImport(settings, db)) {
      const batch = buildImportOutboxBatch(db, settings.cloudImportCheckpoint);
      db = { ...db, outbox: appendOutbox(db.outbox, batch.entries) };
      settings = {
        ...settings,
        cloudImportCheckpoint: batch.checkpoint,
        ...(isImportComplete(batch.checkpoint) ? markImportCompleted() : {}),
      };
      if (batch.entries.length > 0) dirtyTables.add("outbox");
    }

    const settingsOutcome = await syncSettings(supabase, ownerId, settings);
    settings = settingsOutcome.settings;
    if (settingsOutcome.error) result.errors.push(settingsOutcome.error);

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
        const sinceIso = await fetchLastPulledAt(supabase, ownerId);
        for (const table of PULL_ORDER) {
          const { db: nextDb, pulled } = await pullTable(supabase, table, ownerId, sinceIso, db);
          db = nextDb;
          if (pulled > 0) {
            dirtyTables.add(table);
            result.pulled += pulled;
          }
        }
        await touchCheckpoint(supabase, ownerId);
      } catch (e) {
        result.errors.push(classifySyncError(e).message);
      }
    }

    const requeue = requeueConflicts(db);
    db = requeue.db;
    if (requeue.changed) dirtyTables.add("outbox");

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
