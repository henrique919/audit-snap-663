/**
 * Immediate wipe of owned media directories (photos / reports / brand).
 *
 * Used by Clear all data / Reset demo data so file deletion matches the
 * promise made in Settings — not deferred to the 24h-gated GC.
 *
 * Scope is exactly PHOTO_DIR, REPORT_DIR, BRAND_DIR, and CLOUD_CACHE_DIR.
 * Web: no-op (documents live in storage keys / blob URLs, not these dirs).
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { BRAND_DIR, CLOUD_CACHE_DIR, PHOTO_DIR, REPORT_DIR } from "@/lib/files";

export interface WipeFailure {
  uri: string;
  error: string;
}

export interface WipeResult {
  ok: boolean;
  deletedFiles: number;
  failed: WipeFailure[];
}

const OWNED_DIRS = [PHOTO_DIR, REPORT_DIR, BRAND_DIR, CLOUD_CACHE_DIR] as const;

async function listDirContents(dir: string): Promise<string[]> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];
    const names = await FileSystem.readDirectoryAsync(dir);
    return names.map((name) => (dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`));
  } catch (e) {
    // Missing / unreadable dir is not a wipe failure — treat as empty.
    console.log("[wipe] listDirContents skipped", dir, e);
    return [];
  }
}

/**
 * Delete every entry under the three owned media directories.
 * Missing dirs/files are tolerated. Per-entry failures are collected;
 * the wipe continues so a retry can finish the rest.
 */
export async function wipeOwnedMediaDirs(): Promise<WipeResult> {
  if (Platform.OS === "web") {
    return { ok: true, deletedFiles: 0, failed: [] };
  }

  let deletedFiles = 0;
  const failed: WipeFailure[] = [];

  for (const dir of OWNED_DIRS) {
    const uris = await listDirContents(dir);
    for (const uri of uris) {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) continue;
        await FileSystem.deleteAsync(uri, { idempotent: true });
        deletedFiles += 1;
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        const lower = msg.toLowerCase();
        if (
          lower.includes("not found") ||
          lower.includes("no such file") ||
          lower.includes("does not exist")
        ) {
          continue;
        }
        failed.push({ uri, error: msg });
      }
    }
  }

  return { ok: failed.length === 0, deletedFiles, failed };
}

/** Pure messaging helper — success vs honest partial-failure copy. */
export function summarizeWipe(result: WipeResult): { success: boolean; message: string } {
  if (result.ok) {
    return {
      success: true,
      message:
        "All projects, audits, and photo/report files on this device have been deleted.",
    };
  }
  const n = result.failed.length;
  return {
    success: false,
    message:
      `${n} file${n === 1 ? "" : "s"} could not be deleted. ` +
      "Records were cleared. Run Clear all data again to retry the remaining files — it is safe to re-run.",
  };
}
