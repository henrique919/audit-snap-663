/**
 * Offline font CSS for PDF/HTML reports.
 *
 * SHIPPED PATH: system stacks (empty @font-face CSS).
 *
 * Embedding Space Grotesk + Hanken Grotesk TTFs from `@expo-google-fonts/*`
 * exceeds the ~2 MB embed budget and would inflate every large-audit HTML
 * allocation. Deterministic offline beats pretty: rely on `reportFontStack`
 * in constants/typography.ts (`Space Grotesk` / `Hanken Grotesk` with
 * -apple-system / Segoe UI / Roboto / Arial fallbacks).
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
