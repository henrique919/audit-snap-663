/**
 * Report preset helpers (LP-22) — per-project memory + preset summaries.
 */

import type { ReportThemeKey } from "@/constants/config";
import { REPORT_THEMES, resolveThemeKey } from "@/constants/config";
import type { Project } from "@/types/models";

/** One-line “what you get” under each preset in the report builder. */
export const REPORT_PRESET_SUMMARIES: Record<ReportThemeKey, string> = {
  executive:
    "Client-ready cover, comfortable spacing, summary table + detail pages.",
  sitewalk: "Dense hit list first, compact cards, fast field-share PDF.",
  handover: "Formal closeout layout with status emphasis and sign-off block.",
};

export function getPresetSummary(themeKey: string | null | undefined): string {
  const key = resolveThemeKey(themeKey);
  return REPORT_PRESET_SUMMARIES[key] ?? REPORT_THEMES[key].description;
}

/** Resolve initial builder theme: project memory → audit → settings. */
export function resolveInitialReportTheme(input: {
  projectTheme?: string | null;
  auditTheme?: string | null;
  settingsTheme?: string | null;
}): ReportThemeKey {
  if (input.projectTheme) return resolveThemeKey(input.projectTheme);
  if (input.auditTheme) return resolveThemeKey(input.auditTheme);
  return resolveThemeKey(input.settingsTheme);
}

/** Compatible project patch when the user picks a preset. */
export function projectThemeMemoryPatch(
  themeKey: ReportThemeKey,
): Pick<Project, "lastReportThemeKey"> {
  return { lastReportThemeKey: themeKey };
}
