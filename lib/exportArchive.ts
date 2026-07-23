/**
 * Export-all safety archive (LP-05) — archival only, never restorable in-app.
 *
 * Builds a single zip containing every record table, the settings row, and
 * every media file still referenced by the local DB (photo variants, brand
 * logos, generated report PDFs). This is the one recovery path a user has
 * before relying on PunchThis for real records — see docs/launch/EXPORT_FORMAT.md.
 *
 * Memory note: JSZip assembles the whole archive (every file's bytes, plus
 * the final compressed buffer) in memory before it can be written or
 * downloaded — there is no streaming path on either platform. Media is read
 * and added to the zip strictly SEQUENTIALLY (never in parallel) to keep the
 * peak resident set during the *add* phase to "one decoded file + the
 * growing zip", not "N decoded files at once" — but this does not lower the
 * cost of the final `generateAsync()` call itself, which is the actual peak.
 * Measured (see docs/launch/EXPORT_FORMAT.md "Scale limits"): this exact
 * add-then-generateAsync pattern peaked at ~12–18x the raw media size in
 * process memory, and crashed outright (`JavaScript heap out of memory`)
 * around 200-300MB of raw media even under a generous ~4GB desktop V8 heap
 * — real mobile/browser heaps are typically much smaller. This is a real,
 * stated limit, not hidden from users; the honest-failure path below is
 * exactly what happens if it's hit.
 */

import JSZip from "jszip";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { nowIso } from "@/lib/ids";
import { errorMessage } from "@/lib/persistence/retry";
import { WEB_PRINT_SENTINEL } from "@/lib/reportPrintWeb";
import { showAlert } from "@/lib/dialogs";
import { TABLE_NAMES, type Db } from "@/lib/store";
import type { AppSettings } from "@/types/models";

export const EXPORT_FORMAT_VERSION = 1 as const;

/* ------------------------------------ Wording ------------------------------------ */
/*
 * Kept as exported constants (not inline JSX strings) so the archival /
 * not-restorable wording is testable from lib/ without mounting the
 * Settings screen — see lib/__tests__/exportArchive.test.ts.
 */

export const EXPORT_ROW_TITLE = "Export all data";

export const EXPORT_ROW_SUBCOPY =
  "Creates one backup archive of every project, audit, issue, and photo on this device, plus any generated reports. It's for backup and records only — the archive is not restorable in-app; PunchThis cannot import it back in.";

export const EXPORT_SUCCESS_TITLE = "Export ready";

export const EXPORT_FAILURE_TITLE = "Export failed";

export const EXPORT_FAILURE_MESSAGE =
  "The export could not be completed, so nothing was saved or shared. No partial archive was left behind — please try again.";

export const EXPORT_SHARING_UNAVAILABLE_MESSAGE =
  "Sharing is not available on this device, so the archive could not be delivered. Nothing was saved.";

/** Success dialog copy — states where the archive went, then repeats the archival/no-restore fact. */
export function buildExportSuccessMessage(outcome: ExportSuccess): string {
  const deliveryLine =
    outcome.delivery === "share"
      ? "The archive was handed to your device's share sheet — save it somewhere safe."
      : "The archive download has started — save it somewhere safe.";
  const skipLine =
    outcome.skippedCount > 0
      ? ` ${outcome.skippedCount} file${outcome.skippedCount === 1 ? "" : "s"} could not be included and ${outcome.skippedCount === 1 ? "is" : "are"} listed in the archive's manifest.`
      : "";
  return (
    `${deliveryLine} This is a backup archive for your records — it is not restorable in-app.` +
    skipLine
  );
}

/* ------------------------------------ Progress ------------------------------------ */

export const EXPORT_PHASE_MANIFEST = "Preparing export…";
export const EXPORT_PHASE_RECORDS = "Writing records…";
export const EXPORT_PHASE_PACKAGING = "Packaging archive…";
export const EXPORT_PHASE_WRITING = "Saving archive…";
export const EXPORT_PHASE_SHARING = "Opening share sheet…";
export const EXPORT_PHASE_DOWNLOADING = "Preparing download…";

export function exportPhaseMedia(done: number, total: number): string {
  if (total === 0) return "Collecting photos & reports…";
  return `Collecting photos & reports (${done}/${total})…`;
}

export type ExportProgressCallback = (phase: string) => void;

/* ------------------------------------ Manifest ------------------------------------ */

export type ExportMediaRole =
  | "asset-original"
  | "asset-report"
  | "asset-thumb"
  | "asset-annotated"
  | "project-cover"
  | "project-logo"
  | "report-pdf"
  | "settings-logo";

export interface ExportMediaEntry {
  /** Owning record id (asset/project/report id, or "settings" for the app-level logo). */
  id: string;
  role: ExportMediaRole;
  /** Path this file is written at inside the archive, under media/. */
  filename: string;
  sourceUri: string;
}

export interface ExportSkippedEntry extends ExportMediaEntry {
  reason: string;
}

export interface ExportManifest {
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  appVersion: string;
  createdAt: string;
  counts: Record<keyof Db, number>;
  media: ExportMediaEntry[];
  /** Populated during exportAllData as unreadable/missing files are found — always [] from buildExportManifest. */
  skipped: ExportSkippedEntry[];
}

/** Resolves the display app version the same way Settings › About does. */
export function resolveAppVersion(): string {
  return Constants.expoConfig?.version ?? "1.0.0";
}

function extFromUri(uri: string): string {
  if (uri.startsWith("data:")) {
    const mime = /^data:([^;,]+)[;,]/.exec(uri)?.[1] ?? "";
    if (mime.includes("png")) return "png";
    if (mime.includes("pdf")) return "pdf";
    return "jpg";
  }
  const clean = uri.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  const slash = clean.lastIndexOf("/");
  if (dot === -1 || dot < slash) return "bin";
  const ext = clean.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "bin";
}

function mediaFilename(id: string, role: ExportMediaRole, sourceUri: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${role}_${safeId}.${extFromUri(sourceUri)}`;
}

/** Collect every media file this export should attempt to archive, with a stable id/role/filename. */
export function collectExportMedia(db: Db, settings: AppSettings): ExportMediaEntry[] {
  const media: ExportMediaEntry[] = [];

  const addEntry = (id: string, role: ExportMediaRole, uri: string | null | undefined, seen: Set<string>) => {
    if (!uri) return;
    if (seen.has(uri)) return;
    seen.add(uri);
    media.push({ id, role, filename: mediaFilename(id, role, uri), sourceUri: uri });
  };

  for (const asset of db.assets) {
    const seen = new Set<string>();
    addEntry(asset.id, "asset-original", asset.originalUri, seen);
    addEntry(asset.id, "asset-report", asset.reportUri, seen);
    addEntry(asset.id, "asset-thumb", asset.thumbUri, seen);
    addEntry(asset.id, "asset-annotated", asset.annotatedUri, seen);
  }

  for (const project of db.projects) {
    const seen = new Set<string>();
    addEntry(project.id, "project-cover", project.coverPhotoUri, seen);
    addEntry(project.id, "project-logo", project.logoUri, seen);
  }

  for (const report of db.reports) {
    addEntry(report.id, "report-pdf", report.pdfUri, new Set<string>());
  }

  addEntry("settings", "settings-logo", settings.logoUri, new Set<string>());

  return media;
}

/** Pure manifest builder — safe to call repeatedly, no I/O. `skipped` starts empty and is filled in during export. */
export function buildExportManifest(
  db: Db,
  settings: AppSettings,
  opts: { appVersion?: string; createdAt?: string } = {},
): ExportManifest {
  const counts = {} as Record<keyof Db, number>;
  for (const name of TABLE_NAMES) {
    counts[name] = db[name].length;
  }
  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion: opts.appVersion ?? resolveAppVersion(),
    createdAt: opts.createdAt ?? nowIso(),
    counts,
    media: collectExportMedia(db, settings),
    skipped: [],
  };
}

/* ------------------------------------ Filename ------------------------------------ */

/** `punchthis-export-<YYYYMMDD-HHmm>.zip`, local device time. */
export function buildExportFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `punchthis-export-${y}${m}${d}-${hh}${mm}.zip`;
}

/* ------------------------------------ Media read ------------------------------------ */

/**
 * Reads one media entry as a base64 string, or throws a user-legible reason.
 * Native reads the real file (missing/removed files throw); web decodes the
 * data: URI already stored in place of a file (see lib/filesWeb.ts); a
 * WEB_PRINT_SENTINEL report or any remote http(s) URL is never fetched —
 * both are honestly reported as unavailable rather than silently guessed at.
 */
async function readMediaBase64(sourceUri: string): Promise<string> {
  if (sourceUri === WEB_PRINT_SENTINEL) {
    throw new Error("No PDF file exists for this platform (web preview is print-only).");
  }
  if (Platform.OS === "web") {
    const commaIdx = sourceUri.indexOf(",");
    if (!sourceUri.startsWith("data:") || commaIdx === -1) {
      throw new Error("Web export only supports photos already stored in the app, not remote links.");
    }
    return sourceUri.slice(commaIdx + 1);
  }
  if (/^https?:\/\//i.test(sourceUri)) {
    throw new Error("This file is a remote link, not a copy stored on this device.");
  }
  const info = await FileSystem.getInfoAsync(sourceUri);
  if (!info.exists) {
    throw new Error("File no longer exists on this device.");
  }
  return FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
}

/* ------------------------------------ Export orchestration ------------------------------------ */

export type ExportDeliveryMethod = "share" | "download";

export interface ExportSuccess {
  ok: true;
  filename: string;
  delivery: ExportDeliveryMethod;
  skippedCount: number;
  mediaCount: number;
}

export interface ExportFailure {
  ok: false;
  reason: string;
}

export type ExportOutcome = ExportSuccess | ExportFailure;

async function buildZip(
  db: Db,
  settings: AppSettings,
  onProgress?: ExportProgressCallback,
): Promise<{ zip: JSZip; manifest: ExportManifest }> {
  onProgress?.(EXPORT_PHASE_MANIFEST);
  const manifest = buildExportManifest(db, settings);
  const zip = new JSZip();

  onProgress?.(EXPORT_PHASE_RECORDS);
  for (const name of TABLE_NAMES) {
    zip.file(`records/${name}.json`, JSON.stringify(db[name], null, 2));
  }
  zip.file("settings.json", JSON.stringify(settings, null, 2));

  const total = manifest.media.length;
  onProgress?.(exportPhaseMedia(0, total));
  for (let i = 0; i < manifest.media.length; i++) {
    const entry = manifest.media[i];
    try {
      // Sequential by design — see file header. Never Promise.all this loop.
      const base64 = await readMediaBase64(entry.sourceUri);
      zip.file(`media/${entry.filename}`, base64, { base64: true });
    } catch (e) {
      manifest.skipped.push({ ...entry, reason: errorMessage(e) });
    }
    onProgress?.(exportPhaseMedia(i + 1, total));
  }

  // Added last so it reflects the final `skipped` list.
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  return { zip, manifest };
}

async function exportNative(zip: JSZip, onProgress?: ExportProgressCallback): Promise<ExportOutcome> {
  const filename = buildExportFilename();
  const dest = `${FileSystem.cacheDirectory ?? ""}${filename}`;

  onProgress?.(EXPORT_PHASE_PACKAGING);
  let base64Zip: string;
  try {
    base64Zip = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  } catch (e) {
    console.log("[exportArchive] zip generation failed", e);
    showAlert(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    return { ok: false, reason: errorMessage(e) };
  }

  onProgress?.(EXPORT_PHASE_WRITING);
  try {
    await FileSystem.writeAsStringAsync(dest, base64Zip, { encoding: FileSystem.EncodingType.Base64 });
  } catch (e) {
    console.log("[exportArchive] write zip failed", e);
    showAlert(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    return { ok: false, reason: errorMessage(e) };
  }

  onProgress?.(EXPORT_PHASE_SHARING);
  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      showAlert(EXPORT_FAILURE_TITLE, EXPORT_SHARING_UNAVAILABLE_MESSAGE);
      await cleanupQuiet(dest);
      return { ok: false, reason: "Sharing not available on this device" };
    }
    await Sharing.shareAsync(dest, { mimeType: "application/zip", UTI: "public.zip-archive" });
  } catch (e) {
    console.log("[exportArchive] share failed", e);
    showAlert(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    await cleanupQuiet(dest);
    return { ok: false, reason: errorMessage(e) };
  }

  return { ok: true, filename, delivery: "share", skippedCount: 0, mediaCount: 0 };
}

async function cleanupQuiet(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    console.log("[exportArchive] cleanup failed", uri, e);
  }
}

async function exportWeb(zip: JSZip, filename: string, onProgress?: ExportProgressCallback): Promise<ExportOutcome> {
  onProgress?.(EXPORT_PHASE_PACKAGING);
  let blob: Blob;
  try {
    blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  } catch (e) {
    console.log("[exportArchive] zip generation failed", e);
    showAlert(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    return { ok: false, reason: errorMessage(e) };
  }

  onProgress?.(EXPORT_PHASE_DOWNLOADING);
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.log("[exportArchive] download trigger failed", e);
    showAlert(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    return { ok: false, reason: errorMessage(e) };
  }

  return { ok: true, filename, delivery: "download", skippedCount: 0, mediaCount: 0 };
}

/**
 * Builds and delivers the full safety archive. Never throws — every failure
 * path shows an honest dialog, cleans up any temp file, and resolves with
 * `{ ok: false }`. Success always means the archive was fully handed to the
 * share sheet / download, never a partial/best-effort state.
 */
export async function exportAllData(
  db: Db,
  settings: AppSettings,
  onProgress?: ExportProgressCallback,
): Promise<ExportOutcome> {
  try {
    const { zip, manifest } = await buildZip(db, settings, onProgress);
    const outcome =
      Platform.OS === "web"
        ? await exportWeb(zip, buildExportFilename(), onProgress)
        : await exportNative(zip, onProgress);
    if (!outcome.ok) return outcome;
    return { ...outcome, skippedCount: manifest.skipped.length, mediaCount: manifest.media.length };
  } catch (e) {
    console.log("[exportArchive] export failed", e);
    showAlert(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    return { ok: false, reason: errorMessage(e) };
  }
}
