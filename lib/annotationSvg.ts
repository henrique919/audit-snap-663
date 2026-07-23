/**
 * Renders annotation elements as an SVG string overlay for the PDF report.
 * The same normalised element data drives the in-app markup studio (via
 * react-native-svg) and this HTML/SVG output, so markup is always crisp
 * vector in the final report — never a blurry raster copy.
 */

import type { AnnotationElement } from "@/types/models";
import { escapeHtml } from "@/lib/format";

/** Convert a stroke width relative to a 1000px-wide virtual canvas into px. */
export function strokePx(strokeWidth: number, renderWidth: number): number {
  return Math.max(1, (strokeWidth * renderWidth) / 1000);
}

/** Rough single-line text width estimate used for label pills + hit testing. */
export function estimateTextWidthPx(text: string, fontSizePx: number): number {
  return Math.max(fontSizePx * 0.6, text.length * fontSizePx * 0.58);
}

export function arrowHeadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  headLen: number,
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a1 = angle + Math.PI - Math.PI / 7;
  const a2 = angle + Math.PI + Math.PI / 7;
  const p1x = x2 + headLen * Math.cos(a1);
  const p1y = y2 + headLen * Math.sin(a1);
  const p2x = x2 + headLen * Math.cos(a2);
  const p2y = y2 + headLen * Math.sin(a2);
  return `${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`;
}

export interface SvgRenderOptions {
  /**
   * Render privacy-blur elements as fully opaque redaction blocks.
   * Used for the PDF/export path: the PDF renderer is not guaranteed to
   * apply CSS/live blur filters, so exported images must never depend on
   * them — an opaque block can never leak the underlying pixels.
   */
  blurAsRedaction?: boolean;
}

/** Build the inner SVG markup for a set of elements at a given pixel size. */
export function elementsToSvgInner(
  elements: AnnotationElement[],
  w: number,
  h: number,
  options?: SvgRenderOptions,
): string {
  const parts: string[] = [];
  for (const el of elements) {
    switch (el.type) {
      case "arrow": {
        const sw = strokePx(el.strokeWidth, w);
        const x1 = el.x1 * w;
        const y1 = el.y1 * h;
        const x2 = el.x2 * w;
        const y2 = el.y2 * h;
        const head = Math.max(10, sw * 3.4);
        parts.push(
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${el.stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
          `<polygon points="${arrowHeadPoints(x1, y1, x2, y2, head)}" fill="${el.stroke}"/>`,
        );
        break;
      }
      case "ellipse": {
        const sw = strokePx(el.strokeWidth, w);
        parts.push(
          `<ellipse cx="${el.cx * w}" cy="${el.cy * h}" rx="${el.rx * w}" ry="${el.ry * h}" stroke="${el.stroke}" stroke-width="${sw}" fill="none"/>`,
        );
        break;
      }
      case "rect": {
        const sw = strokePx(el.strokeWidth, w);
        parts.push(
          `<rect x="${el.x * w}" y="${el.y * h}" width="${el.width * w}" height="${el.height * h}" rx="${sw}" stroke="${el.stroke}" stroke-width="${sw}" fill="none"/>`,
        );
        break;
      }
      case "pen": {
        const sw = strokePx(el.strokeWidth, w);
        const pts = el.points.map((p) => `${p.x * w},${p.y * h}`).join(" ");
        parts.push(
          `<polyline points="${pts}" stroke="${el.stroke}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
        break;
      }
      case "text": {
        const fs = Math.max(10, (el.fontSize * w) / 1000);
        if (el.bg) {
          const tw = estimateTextWidthPx(el.text, fs);
          const padX = fs * 0.45;
          parts.push(
            `<rect x="${el.x * w - padX}" y="${el.y * h - fs * 1.05}" width="${tw + padX * 2}" height="${fs * 1.5}" rx="${fs * 0.35}" fill="${el.color}" opacity="0.94"/>`,
            `<text x="${el.x * w}" y="${el.y * h}" fill="#FFFFFF" font-size="${fs}" font-weight="800" font-family="Helvetica, Arial, sans-serif">${escapeHtml(el.text)}</text>`,
          );
        } else {
          parts.push(
            `<text x="${el.x * w}" y="${el.y * h}" fill="${el.color}" font-size="${fs}" font-weight="700" font-family="Helvetica, Arial, sans-serif" paint-order="stroke" stroke="rgba(0,0,0,0.55)" stroke-width="${fs / 8}">${escapeHtml(el.text)}</text>`,
          );
        }
        break;
      }
      case "callout": {
        const r = Math.max(12, (el.size * w) / 1000 / 2);
        const cx = el.cx * w;
        const cy = el.cy * h;
        parts.push(
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${el.color}" stroke="#FFFFFF" stroke-width="${r / 6}"/>`,
          `<text x="${cx}" y="${cy + r * 0.38}" fill="#FFFFFF" font-size="${r * 1.1}" font-weight="800" font-family="Helvetica, Arial, sans-serif" text-anchor="middle">${el.number}</text>`,
        );
        break;
      }
      case "blur": {
        // In-app the blur is a live image blur; in exports it becomes an
        // opaque redaction block so it can never leak in the PDF.
        if (!options?.blurAsRedaction) break;
        const x = el.x * w;
        const y = el.y * h;
        const bw = Math.max(2, el.width * w);
        const bh = Math.max(2, el.height * h);
        const r = Math.min(8, bw / 6, bh / 6);
        parts.push(
          `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${r}" fill="#565F68"/>`,
          `<rect x="${x + 1.5}" y="${y + 1.5}" width="${Math.max(1, bw - 3)}" height="${Math.max(1, bh - 3)}" rx="${Math.max(0, r - 1)}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>`,
        );
        const fs = Math.min(bh * 0.34, bw / 8.5, 15);
        if (fs >= 6.5) {
          parts.push(
            `<text x="${x + bw / 2}" y="${y + bh / 2 + fs * 0.36}" fill="rgba(255,255,255,0.72)" font-size="${fs}" font-weight="700" letter-spacing="1.2" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">REDACTED</text>`,
          );
        }
        break;
      }
    }
  }
  return parts.join("");
}

/** Full absolute-positioned overlay SVG for report HTML. */
export function elementsToOverlaySvg(
  elements: AnnotationElement[],
  w: number,
  h: number,
  options?: SvgRenderOptions,
): string {
  if (elements.length === 0) return "";
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;">${elementsToSvgInner(elements, w, h, options)}</svg>`;
}
