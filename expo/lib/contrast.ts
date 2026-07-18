/**
 * WCAG 2.x contrast helpers (LP-06 accessibility regression suite).
 *
 * Implements the standard relative-luminance + contrast-ratio formulas
 * (https://www.w3.org/TR/WCAG21/#contrast-minimum) so palette changes can be
 * asserted against the AA thresholds (4.5:1 normal text, 3:1 large text /
 * UI components) instead of relying on eyeballing hex values.
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function channelLuminance(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance (WCAG), 0 (black) – 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio between two colours, always ≥ 1. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;

export function meetsAA(hexA: string, hexB: string, large: boolean = false): boolean {
  return contrastRatio(hexA, hexB) >= (large ? WCAG_AA_LARGE : WCAG_AA_NORMAL);
}
