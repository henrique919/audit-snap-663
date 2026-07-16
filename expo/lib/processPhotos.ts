/**
 * Bounded-concurrency processing for multi-photo gallery picks — same
 * worker-pool shape as resolveReportImages (lib/reportImages.ts), capped
 * lower (2) since photo processing (dimension probing + encode) is heavier
 * per-item than resolving an already-encoded image to a data URI.
 */

import { newId } from "@/lib/ids";
import { ProcessedPhoto, processPickedPhoto } from "@/lib/files";

export interface ProcessPhotosOptions {
  /** Max concurrent photo-processing calls. Capped at 2. Default 2. */
  concurrency?: number;
  /** Fired after each photo finishes processing (success or failure). */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Process picked photo URIs into their stored variants with a small worker
 * pool. Output preserves input order regardless of completion order. A
 * single failure rejects the whole batch (matches the previous serial
 * for-loop's behaviour — callers already handle this via try/catch).
 */
export async function processPhotosBounded(
  uris: string[],
  opts: ProcessPhotosOptions = {},
): Promise<ProcessedPhoto[]> {
  const total = uris.length;
  const results: ProcessedPhoto[] = new Array(total);
  if (total === 0) {
    opts.onProgress?.(0, 0);
    return results;
  }

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 2, 2));
  let nextIndex = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;
      results[index] = await processPickedPhoto(uris[index], newId());
      done += 1;
      opts.onProgress?.(done, total);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
  return results;
}
