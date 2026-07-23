/**
 * Web image pipeline.
 *
 * expo-image-picker's web implementation hands back a `blob:` URL
 * (URL.createObjectURL) — valid only for the lifetime of the document that
 * created it, gone after a reload — and there is no real filesystem to
 * copy it into. Both problems are solved the same way: decode the picked
 * image once via an offscreen canvas and re-encode it as a JPEG `data:`
 * URI, a self-contained string that round-trips through
 * AsyncStorage/localStorage with no external reference to go stale.
 *
 * `originalUri` reuses the report-size variant rather than keeping a true
 * full-resolution copy — web has no real filesystem, so "original" lives
 * in localStorage like everything else, and a genuinely full-res copy per
 * photo risks exhausting the per-origin quota after only a few captures.
 */

export interface WebImageVariant {
  dataUri: string;
  width: number;
  height: number;
}

/** Shared web variant sizing — used by the pick pipeline and by crop/rotate re-encodes. */
export const WEB_REPORT_MAX_DIM = 1800;
export const WEB_REPORT_QUALITY = 0.72;
export const WEB_THUMB_MAX_DIM = 500;
export const WEB_THUMB_QUALITY = 0.6;

export interface ProcessedWebPhoto {
  originalUri: string;
  reportUri: string;
  thumbUri: string;
  width: number;
  height: number;
}

/** Fit within maxDim on the longer side, preserving aspect ratio. Never upscales. */
export function fitDimensions(
  width: number,
  height: number,
  maxDim: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImageElement(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${uri}`));
    img.src = uri;
  });
}

function drawToDataUri(img: HTMLImageElement, maxDim: number, quality: number): WebImageVariant {
  const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, maxDim);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUri: canvas.toDataURL("image/jpeg", quality), width, height };
}

/**
 * Re-encode any same-session image URI (blob: object URL, data:, http) into a
 * durable JPEG data URI. Never upscales. This is the required exit path for
 * expo-image-manipulator results on web — its blob: URLs die with the browser
 * session, so persisting one loses the photo on the next launch.
 */
export async function reencodeWebImage(
  uri: string,
  maxDim: number,
  quality: number,
): Promise<WebImageVariant> {
  const img = await loadImageElement(uri);
  return drawToDataUri(img, maxDim, quality);
}

/** Revoke a blob: object URL once its pixels have been re-encoded. Safe on any input. */
export function releaseWebObjectUrl(uri: string): void {
  if (!uri.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(uri);
  } catch {
    // already revoked / not ours — nothing to do
  }
}

/** Decode a picked image and produce report (<=1800px, q0.72) + thumb (<=500px, q0.6) JPEG data URIs. */
export async function processPickedPhotoWeb(sourceUri: string): Promise<ProcessedWebPhoto> {
  const img = await loadImageElement(sourceUri);
  const report = drawToDataUri(img, WEB_REPORT_MAX_DIM, WEB_REPORT_QUALITY);
  const thumb = drawToDataUri(img, WEB_THUMB_MAX_DIM, WEB_THUMB_QUALITY);
  return {
    originalUri: report.dataUri,
    reportUri: report.dataUri,
    thumbUri: thumb.dataUri,
    width: report.width,
    height: report.height,
  };
}
