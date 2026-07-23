/**
 * Closeout hub (LP-21) — hit-list counts + completeness warnings.
 */

import type { Issue, IssueStatus } from "@/types/models";

export interface CloseoutStatusCounts {
  total: number;
  open: number;
  assigned: number;
  inProgress: number;
  completed: number;
}

export type CloseoutMissingField = "title" | "location" | "assignee";

export interface CloseoutCompletenessWarning {
  issueId: string;
  issueNumber: number;
  /** Display title or fallback for the warning row. */
  label: string;
  missing: CloseoutMissingField[];
}

const STATUS_BUCKET: Record<IssueStatus, keyof Omit<CloseoutStatusCounts, "total">> = {
  open: "open",
  assigned: "assigned",
  in_progress: "inProgress",
  completed: "completed",
};

export function countIssuesByStatus(issues: Issue[]): CloseoutStatusCounts {
  const counts: CloseoutStatusCounts = {
    total: 0,
    open: 0,
    assigned: 0,
    inProgress: 0,
    completed: 0,
  };
  for (const issue of issues) {
    if (issue.deletedAt) continue;
    counts.total += 1;
    counts[STATUS_BUCKET[issue.status]] += 1;
  }
  return counts;
}

/** Missing title / location / assignee — links are the caller's job. */
export function findCompletenessWarnings(issues: Issue[]): CloseoutCompletenessWarning[] {
  const warnings: CloseoutCompletenessWarning[] = [];
  for (const issue of issues) {
    if (issue.deletedAt) continue;
    const missing: CloseoutMissingField[] = [];
    if (!issue.title.trim()) missing.push("title");
    if (!issue.locationId) missing.push("location");
    if (!issue.assigneeId) missing.push("assignee");
    if (missing.length === 0) continue;
    warnings.push({
      issueId: issue.id,
      issueNumber: issue.issueNumber,
      label: issue.title.trim() || "Untitled issue",
      missing,
    });
  }
  return warnings.sort((a, b) => a.issueNumber - b.issueNumber);
}

export function formatMissingFields(missing: CloseoutMissingField[]): string {
  const labels: Record<CloseoutMissingField, string> = {
    title: "title",
    location: "location",
    assignee: "assignee",
  };
  return missing.map((m) => labels[m]).join(", ");
}
