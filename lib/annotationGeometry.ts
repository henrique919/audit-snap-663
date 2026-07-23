/**
 * Pure geometry for the layered markup editor — bounds, selection handles,
 * hit testing, translation and resizing of annotation elements.
 *
 * All coordinates are normalised 0..1 relative to the image. `aspect` is
 * canvasWidth / canvasHeight and converts x-relative sizes (font size and
 * callout radius are defined against a virtual 1000px-wide canvas) into
 * y-axis units so bounds stay square on non-square photos.
 */

import type { AnnotationElement } from "@/types/models";

export interface NormPoint {
  x: number;
  y: number;
}

export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Handle identifiers: arrow endpoints, bounding-box corners, or a scale grip. */
export type HandleId = "p1" | "p2" | "tl" | "tr" | "bl" | "br" | "scale";

export interface HandleSpec extends NormPoint {
  id: HandleId;
}

const MIN_SIZE = 0.02;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Normalised bounding box of an element. */
export function elementBounds(el: AnnotationElement, aspect: number): NormRect {
  switch (el.type) {
    case "arrow": {
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        width: Math.abs(el.x2 - el.x1),
        height: Math.abs(el.y2 - el.y1),
      };
    }
    case "ellipse":
      return { x: el.cx - el.rx, y: el.cy - el.ry, width: el.rx * 2, height: el.ry * 2 };
    case "rect":
    case "blur":
      return { x: el.x, y: el.y, width: el.width, height: el.height };
    case "pen": {
      if (el.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = 1;
      let minY = 1;
      let maxX = 0;
      let maxY = 0;
      for (const p of el.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    case "text": {
      const fsX = el.fontSize / 1000;
      const width = el.text.length * 0.58 * fsX + fsX * 0.9;
      const height = fsX * 1.5 * aspect;
      return { x: el.x - fsX * 0.45, y: el.y - height * 0.72, width, height };
    }
    case "callout": {
      const r = Math.max(el.size, 24) / 2000;
      const ry = r * aspect;
      return { x: el.cx - r, y: el.cy - ry, width: r * 2, height: ry * 2 };
    }
  }
}

/** Selection handles for an element (empty for pen strokes — move only). */
export function elementHandles(el: AnnotationElement, aspect: number): HandleSpec[] {
  switch (el.type) {
    case "arrow":
      return [
        { id: "p1", x: el.x1, y: el.y1 },
        { id: "p2", x: el.x2, y: el.y2 },
      ];
    case "ellipse":
    case "rect":
    case "blur": {
      const b = elementBounds(el, aspect);
      return [
        { id: "tl", x: b.x, y: b.y },
        { id: "tr", x: b.x + b.width, y: b.y },
        { id: "bl", x: b.x, y: b.y + b.height },
        { id: "br", x: b.x + b.width, y: b.y + b.height },
      ];
    }
    case "text": {
      const b = elementBounds(el, aspect);
      return [{ id: "scale", x: b.x + b.width, y: b.y + b.height }];
    }
    case "callout": {
      const r = Math.max(el.size, 24) / 2000;
      return [{ id: "scale", x: el.cx + r, y: el.cy }];
    }
    case "pen":
      return [];
  }
}

/** Whether a normalised point falls on/near an element (generous field-thumb pad). */
export function hitTestElement(el: AnnotationElement, p: NormPoint, aspect: number): boolean {
  const pad = 0.03;
  if (el.type === "pen") {
    return el.points.some((pt) => Math.abs(pt.x - p.x) < pad * 1.6 && Math.abs(pt.y - p.y) < pad * 1.6);
  }
  const b = elementBounds(el, aspect);
  return p.x >= b.x - pad && p.x <= b.x + b.width + pad && p.y >= b.y - pad && p.y <= b.y + b.height + pad;
}

/** Move a whole element by a normalised delta. */
export function translateElement(el: AnnotationElement, dx: number, dy: number): AnnotationElement {
  switch (el.type) {
    case "arrow":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "ellipse":
      return { ...el, cx: el.cx + dx, cy: el.cy + dy };
    case "rect":
    case "blur":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "pen":
      return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "text":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "callout":
      return { ...el, cx: el.cx + dx, cy: el.cy + dy };
  }
}

/**
 * Resize `base` (the element as it was when the drag started) by dragging
 * `handle` to point `p`. Returns the updated element.
 */
export function resizeElement(
  base: AnnotationElement,
  handle: HandleId,
  p: NormPoint,
  aspect: number,
): AnnotationElement {
  switch (base.type) {
    case "arrow": {
      if (handle === "p1") return { ...base, x1: p.x, y1: p.y };
      if (handle === "p2") return { ...base, x2: p.x, y2: p.y };
      return base;
    }
    case "rect":
    case "blur": {
      const b = elementBounds(base, aspect);
      const anchor = cornerAnchor(b, handle);
      if (!anchor) return base;
      const x = Math.min(anchor.x, p.x);
      const y = Math.min(anchor.y, p.y);
      return {
        ...base,
        x,
        y,
        width: Math.max(MIN_SIZE, Math.abs(p.x - anchor.x)),
        height: Math.max(MIN_SIZE, Math.abs(p.y - anchor.y)),
      };
    }
    case "ellipse": {
      const b = elementBounds(base, aspect);
      const anchor = cornerAnchor(b, handle);
      if (!anchor) return base;
      const x = Math.min(anchor.x, p.x);
      const y = Math.min(anchor.y, p.y);
      const width = Math.max(MIN_SIZE, Math.abs(p.x - anchor.x));
      const height = Math.max(MIN_SIZE, Math.abs(p.y - anchor.y));
      return { ...base, cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2 };
    }
    case "text": {
      if (handle !== "scale") return base;
      const b = elementBounds(base, aspect);
      const factor = clamp((p.x - b.x) / Math.max(0.03, b.width), 0.25, 5);
      return { ...base, fontSize: clamp(Math.round(base.fontSize * factor), 16, 140) };
    }
    case "callout": {
      if (handle !== "scale") return base;
      const dx = p.x - base.cx;
      const dy = (p.y - base.cy) / Math.max(0.1, aspect);
      const dist = Math.sqrt(dx * dx + dy * dy);
      return { ...base, size: clamp(Math.round(dist * 2000), 32, 200) };
    }
    case "pen":
      return base;
  }
}

function cornerAnchor(b: NormRect, handle: HandleId): NormPoint | null {
  switch (handle) {
    case "tl":
      return { x: b.x + b.width, y: b.y + b.height };
    case "tr":
      return { x: b.x, y: b.y + b.height };
    case "bl":
      return { x: b.x + b.width, y: b.y };
    case "br":
      return { x: b.x, y: b.y };
    default:
      return null;
  }
}
