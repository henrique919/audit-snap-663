/**
 * Media reference registry + orphan garbage collection.
 *
 * Wave 1: soft-deleted asset rows KEEP their files. Records still point at
 * those URIs (and future sync may need them), so `collectReferencedUris`
 * includes soft-deleted rows. Only files with no DB reference at all — and
 * older than the age gate — are eligible for deletion.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { BRAND_DIR, PHOTO_DIR, REPORT_DIR, deleteFileQuiet } from "@/lib/files";
import type { Db } from "@/lib/store";
import type { AppSettings } from "@/types/models";

export interface MediaGcResult {
  scanned: number;
  deleted: number;
  freedBytes: number;
}

export interface MediaGcOptions {
  dryRun?: boolean;
  /** Skip files newer than this (default 24h). Protects in-flight captures. */
  minAgeMs?: number;
  /** Injected clock for tests. */
  nowMs?: number;
}

const DEFAULT_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Collect every media URI still referenced by the local DB / settings. */
export function collectReferencedUris(db: Db, settingsLogoUri: string | null): Set<string> {
  const refs = new Set<string>();
  const add = (uri: string | null | undefined) => {
    if (uri) refs.add(uri);
  };

  // Include soft-deleted assets — Wave 1 keeps their files for possible sync.
  for (const a of db.assets) {
    add(a.originalUri);
    add(a.reportUri);
    add(a.thumbUri);
    add(a.annotatedUri);
  }
  for (const p of db.projects) {
    add(p.coverPhotoUri);
    add(p.logoUri);
  }
  add(settingsLogoUri);
  for (const r of db.reports) {
    add(r.pdfUri);
  }
  return refs;
}

/**
 * Pull a millisecond epoch embedded as `_<digits>` before the file extension
 * (e.g. `report_abc_1710000000000.jpg`). Returns null when absent.
 */
export function parseEmbeddedTimestampMs(fileName: string): number | null {
  const match = /_(\d{10,16})(?:\.[^.]+)?$/.exec(fileName);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function fileAgeMs(
  fileName: string,
  info: { modificationTime?: number },
  nowMs: number,
): number {
  const embedded = parseEmbeddedTimestampMs(fileName);
  if (embedded != null) return Math.max(0, nowMs - embedded);
  const mod = info.modificationTime;
  if (typeof mod === "number" && mod > 0) {
    // expo-file-system modificationTime is seconds since epoch.
    const modMs = mod > 1e12 ? mod : mod * 1000;
    return Math.max(0, nowMs - modMs);
  }
  // Unknown age → treat as young (do not delete).
  return 0;
}

async function listDirFiles(dir: string): Promise<string[]> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];
    const names = await FileSystem.readDirectoryAsync(dir);
    return names.map((name) => (dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`));
  } catch (e) {
    console.log("[mediaRegistry] listDir failed", dir, e);
    return [];
  }
}

/** Approximate on-disk media footprint for Settings UI. */
export async function estimateMediaStorage(): Promise<{ fileCount: number; totalBytes: number }> {
  if (Platform.OS === "web") return { fileCount: 0, totalBytes: 0 };
  const dirs = [PHOTO_DIR, REPORT_DIR, BRAND_DIR];
  let fileCount = 0;
  let totalBytes = 0;
  for (const dir of dirs) {
    const uris = await listDirFiles(dir);
    for (const uri of uris) {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || info.isDirectory) continue;
        fileCount += 1;
        totalBytes += typeof info.size === "number" ? info.size : 0;
      } catch {
        // ignore per-file errors
      }
    }
  }
  return { fileCount, totalBytes };
}

/**
 * Delete orphan files under photos/reports/brand that are unreferenced and
 * older than `minAgeMs` (default 24h).
 */
export async function runMediaGc(
  db: Db,
  settings: Pick<AppSettings, "logoUri">,
  opts: MediaGcOptions = {},
): Promise<MediaGcResult> {
  if (Platform.OS === "web") {
    return { scanned: 0, deleted: 0, freedBytes: 0 };
  }

  const dryRun = opts.dryRun === true;
  const minAgeMs = opts.minAgeMs ?? DEFAULT_MIN_AGE_MS;
  const nowMs = opts.nowMs ?? Date.now();
  const referenced = collectReferencedUris(db, settings.logoUri);

  const candidates = [
    ...(await listDirFiles(PHOTO_DIR)),
    ...(await listDirFiles(REPORT_DIR)),
    ...(await listDirFiles(BRAND_DIR)),
  ];

  let scanned = 0;
  let deleted = 0;
  let freedBytes = 0;

  for (const uri of candidates) {
    scanned += 1;
    if (referenced.has(uri)) continue;

    let info: { exists: boolean; isDirectory?: boolean; size?: number; modificationTime?: number };
    try {
      info = await FileSystem.getInfoAsync(uri);
    } catch {
      continue;
    }
    if (!info.exists || info.isDirectory) continue;

    const fileName = uri.split("/").pop() ?? uri;
    const age = fileAgeMs(fileName, info, nowMs);
    if (age < minAgeMs) continue;

    const size = typeof info.size === "number" ? info.size : 0;
    if (!dryRun) {
      await deleteFileQuiet(uri);
    }
    deleted += 1;
    freedBytes += size;
  }

  return { scanned, deleted, freedBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
