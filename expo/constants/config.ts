/**
 * Central brand / product configuration.
 *
 * The working product name is temporary — rename the app by editing THIS file
 * only. Nothing in the app hard-codes the name, report title, or brand colors.
 */

export const BrandConfig = {
  /** Display name shown in headers, settings and about. */
  appName: "Clean Audit IQ",
  /** Short tagline used on the home screen and cover pages. */
  tagline: "Site photos → professional audit reports",
  /** Default title used for generated report documents. */
  reportName: "Site Audit Report",
  /** Footer credit line printed on reports. Leave empty to hide. */
  reportFooter: "Generated with Clean Audit IQ",
  /** Company placeholder used when a project has no company name. */
  defaultCompanyName: "",
  /** Marketing site (shown in Settings › About only). */
  website: "cleanruniq.com",
  /**
   * Brand logo placeholder. Set to a require(...) or remote URL later.
   * When null, the app renders a monogram tile from `monogram` below.
   */
  logoUri: null as string | null,
  /** Two-letter monogram used for the logo placeholder tile. */
  monogram: "CA",
  /** Primary brand color (deep navy). */
  brandPrimary: "#0E1F3A",
  /** Accent color (restrained green). */
  brandAccent: "#16A34A",
} as const;

/** Report themes available in the report builder. */
export type ReportThemeKey = "navy" | "slate" | "forest";

export const REPORT_THEMES: Record<
  ReportThemeKey,
  { label: string; primary: string; accent: string; heading: string }
> = {
  navy: { label: "Classic Navy", primary: "#0E1F3A", accent: "#16A34A", heading: "#0E1F3A" },
  slate: { label: "Minimal Slate", primary: "#1F2937", accent: "#0EA5E9", heading: "#111827" },
  forest: { label: "Field Forest", primary: "#14342B", accent: "#D97706", heading: "#14342B" },
};

/** Default email templates used by the share flow. */
export function buildEmailSubject(projectName: string, auditDate: string): string {
  return `${BrandConfig.reportName} - ${projectName} - ${auditDate}`;
}

export function buildEmailBody(projectName: string, auditDate: string, inspectorName: string): string {
  return `Hi,\n\nPlease find attached the site audit report for ${projectName}, completed on ${auditDate}.\n\nRegards,\n${inspectorName || "Inspector"}`;
}
