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

/** Decode a picked image and produce report (<=1800px, q0.72) + thumb (<=500px, q0.6) JPEG data URIs. */
export async function processPickedPhotoWeb(sourceUri: string): Promise<ProcessedWebPhoto> {
  const img = await loadImageElement(sourceUri);
  const report = drawToDataUri(img, 1800, 0.72);
  const thumb = drawToDataUri(img, 500, 0.6);
  return {
    originalUri: report.dataUri,
    reportUri: report.dataUri,
    thumbUri: thumb.dataUri,
    width: report.width,
    height: report.height,
  };
}
