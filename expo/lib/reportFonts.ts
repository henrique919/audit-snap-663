/**
 * Offline font CSS for PDF/HTML reports.
 *
 * SHIPPED PATH: system stacks (empty @font-face CSS).
 *
 * Embedding spike — Archivo 700/800 + Inter 400/600/700/800 from
 * `@expo-google-fonts/*` measured on disk:
 *   Inter ×4 ≈ 1.37 MB, Archivo ×2 ≈ 0.24 MB → ~1.62 MB raw TTFs
 *   ≈ ~2.15 MB as base64 data-URIs inside the HTML string.
 * That exceeds the ~2 MB embed budget and would inflate every large-audit
 * HTML allocation (the same path we are memory-hardening). Embedding via
 * expo-asset also failed reliability checks in Node/Jest (Asset.fromModule
 * + readAsStringAsync is device-oriented).
 *
 * Deterministic offline beats pretty: remove the Google Fonts `@import`
 * and rely on `reportFontStack` in constants/typography.ts
 * (`Archivo`/`Inter` with -apple-system / Segoe UI / Roboto / Arial fallbacks).
 */

/** Module-scope cache — fonts never change at runtime. */
let cachedFontFaceCss: string | null = null;

/**
 * Returns `@font-face` CSS to inject into report HTML, or "" when using
 * system stacks (the shipped path).
 */
export async function getReportFontFaceCss(): Promise<string> {
  if (cachedFontFaceCss !== null) return cachedFontFaceCss;
  // System-stack fallback — see file header for size/reliability rationale.
  cachedFontFaceCss = "";
  return cachedFontFaceCss;
}

/** Sync accessor for already-resolved CSS ("" until/unless getReportFontFaceCss ran). */
export function getCachedReportFontFaceCss(): string {
  return cachedFontFaceCss ?? "";
}

/** Test-only: clear the module cache between cases. */
export function __resetReportFontFaceCssForTests(): void {
  cachedFontFaceCss = null;
}
