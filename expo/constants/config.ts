/**
 * Central brand / product configuration.
 *
 * Rename or retheme the product by editing THIS file. Screens and reports
 * read from BrandConfig / REPORT_THEMES — nothing hard-codes the name.
 */

export const BrandConfig = {
  /** Display name shown in headers, settings and about. */
  appName: "PunchThis",
  /** Short tagline used on the home screen and cover pages. */
  tagline: "Punch it. Prove it. Close it.",
  /** Default title used for generated report documents. */
  reportName: "Site Audit Report",
  /** Footer credit line printed on reports. Leave empty to hide. */
  reportFooter: "Generated with PunchThis",
  /** Company placeholder used when a project has no company name. */
  defaultCompanyName: "",
  /** Marketing site (shown in Settings › About only). */
  website: "punchthis.app",
  /**
   * Brand logo placeholder. Set to a require(...) or remote URL later.
   * When null, the app renders the Marked Frame symbol from BrandMark.
   */
  logoUri: null as string | null,
  /** Two-letter monogram fallback (rarely shown — SVG mark is preferred). */
  monogram: "PT",
  /** Primary brand ink (Graphite Ink). */
  brandPrimary: "#1C232B",
  /** Accent color (Blueprint Cobalt). */
  brandAccent: "#4C82FF",
} as const;

/**
 * Report themes. Each theme drives the cover layout, density, accent
 * treatment and table styling of the generated PDF — all report design is
 * centralised here and in lib/report.ts so new themes are cheap to add.
 */
export type ReportThemeKey = "executive" | "sitewalk" | "handover";

export interface ReportTheme {
  label: string;
  /** One-line purpose shown in the report builder. */
  description: string;
  primary: string;
  accent: string;
  heading: string;
  /** Cover page layout variant. */
  coverVariant: "executive" | "compact" | "formal";
  /** compact = smaller type, denser item cards, 3-across photos. */
  density: "comfortable" | "compact";
}

export const REPORT_THEMES: Record<ReportThemeKey, ReportTheme> = {
  executive: {
    label: "Executive",
    description: "Polished client handover — strong cover, premium spacing",
    primary: "#1C232B",
    accent: "#4C82FF",
    heading: "#1C232B",
    coverVariant: "executive",
    density: "comfortable",
  },
  sitewalk: {
    label: "Site Walk",
    description: "Fast field report — compact, issue-dense, strong hit list",
    primary: "#22303C",
    accent: "#4C82FF",
    heading: "#1C232B",
    coverVariant: "compact",
    density: "compact",
  },
  handover: {
    label: "Handover",
    description: "Formal closeout — status-focused with sign-off block",
    primary: "#12181F",
    accent: "#E5A016",
    heading: "#1C232B",
    coverVariant: "formal",
    density: "comfortable",
  },
};

/** Coerce stored theme keys (including legacy navy/slate/forest) to a valid theme. */
export function resolveThemeKey(key: string | null | undefined): ReportThemeKey {
  if (key && key in REPORT_THEMES) return key as ReportThemeKey;
  if (key === "navy") return "executive";
  if (key === "slate") return "sitewalk";
  if (key === "forest") return "handover";
  return "executive";
}

/** Default email templates used by the share flow. */
export function buildEmailSubject(projectName: string, auditDate: string): string {
  return `${BrandConfig.reportName} - ${projectName} - ${auditDate}`;
}

export function buildEmailBody(projectName: string, auditDate: string, inspectorName: string): string {
  return `Hi,\n\nPlease find attached the site audit report for ${projectName}, completed on ${auditDate}.\n\nRegards,\n${inspectorName || "Inspector"}`;
}
