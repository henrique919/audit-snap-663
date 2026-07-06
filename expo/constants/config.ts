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
  /** Primary brand color (CleanRun IQ carbon). */
  brandPrimary: "#161A1D",
  /** Accent color (CleanRun IQ green). */
  brandAccent: "#18A94F",
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
    primary: "#161A1D",
    accent: "#20C55E",
    heading: "#161A1D",
    coverVariant: "executive",
    density: "comfortable",
  },
  sitewalk: {
    label: "Site Walk",
    description: "Fast field report — compact, issue-dense, strong hit list",
    primary: "#1F2937",
    accent: "#1D4ED8",
    heading: "#111827",
    coverVariant: "compact",
    density: "compact",
  },
  handover: {
    label: "Handover",
    description: "Formal closeout — status-focused with sign-off block",
    primary: "#14342B",
    accent: "#C27803",
    heading: "#14342B",
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
