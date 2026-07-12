/**
 * Bounded image resolution for PDF report generation.
 *
 * File-URI spike (SDK 54 / expo-print):
 * - iOS: Print.printToFileAsync HTML does NOT load local `file://` image srcs.
 *   Official Expo docs: WKWebView blocks local asset URLs in print HTML; images
 *   must be inlined as base64 data URIs. (expo/expo#7940, docs/sdk/print)
 * - Android: file:// / filesystem srcs sometimes work in WebView print, but are
 *   not guaranteed across WebView versions or release vs debug asset paths.
 * - Verdict: prefer bounded base64 on EVERY platform. Correctness beats the
 *   zero-copy file-URI path. Concurrency ≤3 keeps peak decode memory bounded.
 */

import { fileToDataUri } from "@/lib/files";

export interface ResolveReportImagesOptions {
  /** Max concurrent file→data-URI conversions. Capped at 3. Default 3. */
  concurrency?: number;
  /** Fired after each URI attempt completes (success or failure). */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Resolve local image URIs to embeddable data URIs with a small worker pool.
 * Missing/unreadable files are omitted from the map (callers render a
 * placeholder). Never throws for individual file failures.
 */
export async function resolveReportImages(
  uris: string[],
  opts: ResolveReportImagesOptions = {},
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(uris.filter(Boolean)));
  const total = unique.length;
  const map = new Map<string, string>();
  if (total === 0) {
    opts.onProgress?.(0, 0);
    return map;
  }

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 3));
  let nextIndex = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= unique.length) return;
      const uri = unique[index];
      try {
        const resolved = await fileToDataUri(uri);
        if (resolved) map.set(uri, resolved);
      } catch (e) {
        console.log("[reportImages] resolve failed", uri, e);
      } finally {
        done += 1;
        opts.onProgress?.(done, total);
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
  return map;
}
