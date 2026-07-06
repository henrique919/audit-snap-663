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

/** Build the inner SVG markup for a set of elements at a given pixel size. */
export function elementsToSvgInner(elements: AnnotationElement[], w: number, h: number): string {
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
        parts.push(
          `<text x="${el.x * w}" y="${el.y * h}" fill="${el.color}" font-size="${fs}" font-weight="700" font-family="Helvetica, Arial, sans-serif" paint-order="stroke" stroke="rgba(0,0,0,0.55)" stroke-width="${fs / 8}">${escapeHtml(el.text)}</text>`,
        );
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
        parts.push(
          `<rect x="${el.x * w}" y="${el.y * h}" width="${el.width * w}" height="${el.height * h}" rx="6" fill="#B9C2CF" opacity="0.97"/>`,
        );
        break;
      }
    }
  }
  return parts.join("");
}

/** Full absolute-positioned overlay SVG for report HTML. */
export function elementsToOverlaySvg(elements: AnnotationElement[], w: number, h: number): string {
  if (elements.length === 0) return "";
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;">${elementsToSvgInner(elements, w, h)}</svg>`;
}
