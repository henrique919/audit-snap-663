/**
 * Quick Walk (LP-20) — capture-first audit defaults + pilot timing.
 */

import type { ReportThemeKey } from "@/constants/config";
import { resolveThemeKey } from "@/constants/config";
import { formatShortDate } from "@/lib/dates";
import { todayIsoDate } from "@/lib/format";
import type { AppSettings, Project } from "@/types/models";

export interface QuickWalkProjectDefaults {
  name: string;
  reference: string;
  clientName: string;
  siteAddress: string;
  companyName: string;
  inspectorName: string;
  coverPhotoUri: null;
  logoUri: null;
}

export interface QuickWalkAuditDefaults {
  projectId: string;
  title: string;
  auditDate: string;
  preparedFor: string;
  preparedBy: string;
  defaultLocationId: null;
  defaultAssigneeId: null;
  themeKey: ReportThemeKey;
}

/** Minimal project fields for a name-only Quick Walk create. */
export function buildQuickWalkProjectInput(
  name: string,
  settings: Pick<AppSettings, "companyName" | "inspectorName">,
): QuickWalkProjectDefaults {
  return {
    name: name.trim(),
    reference: "",
    clientName: "",
    siteAddress: "",
    companyName: settings.companyName.trim(),
    inspectorName: settings.inspectorName.trim(),
    coverPhotoUri: null,
    logoUri: null,
  };
}

/**
 * Prefer Site Walk for Quick Walk when settings still default to Executive
 * (the form default for a field walk).
 */
export function resolveQuickWalkThemeKey(settingsTheme: string | null | undefined): ReportThemeKey {
  const resolved = resolveThemeKey(settingsTheme);
  return resolved === "executive" ? "sitewalk" : resolved;
}

/** Sensible audit defaults — skip the full audit-new form. */
export function buildQuickWalkAuditInput(
  project: Pick<Project, "id" | "clientName" | "inspectorName">,
  settings: Pick<AppSettings, "inspectorName" | "defaultReportOptions">,
  now: Date = new Date(),
): QuickWalkAuditDefaults {
  return {
    projectId: project.id,
    title: `Site Walk — ${formatShortDate(now)}`,
    auditDate: todayIsoDate(),
    preparedFor: project.clientName.trim(),
    preparedBy: (project.inspectorName || settings.inspectorName).trim(),
    defaultLocationId: null,
    defaultAssigneeId: null,
    themeKey: resolveQuickWalkThemeKey(settings.defaultReportOptions.themeKey),
  };
}

export interface TimeToFirstIssueResult {
  startedAtMs: number;
  savedAtMs: number;
  durationMs: number;
  durationSec: number;
}

/** Pilot metric — no analytics SDK; caller logs / stores. */
export function measureTimeToFirstIssue(
  startedAtMs: number,
  savedAtMs: number = Date.now(),
): TimeToFirstIssueResult | null {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return null;
  if (!Number.isFinite(savedAtMs) || savedAtMs < startedAtMs) return null;
  const durationMs = savedAtMs - startedAtMs;
  return {
    startedAtMs,
    savedAtMs,
    durationMs,
    durationSec: Math.round(durationMs / 1000),
  };
}

export function logTimeToFirstIssue(result: TimeToFirstIssueResult): void {
  console.log(
    `[pilot] time-to-first-issue ${result.durationSec}s (${result.durationMs}ms)`,
  );
}
