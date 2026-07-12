import type { AnnotationRecord, Issue, PhotoAsset, ReportExport } from "@/types/models";

/**
 * Pure freshness check for the latest generated PDF of an audit.
 * Compares export time against the newest content change (issues, photos,
 * annotations — including soft-deletes, which also bump updatedAt).
 */
export function computeReportFreshness(input: {
  reports: ReportExport[];
  issues: Issue[];
  assets: PhotoAsset[];
  annotations: AnnotationRecord[];
  auditId: string | undefined;
}): { lastExport: ReportExport | null; contentUpdatedAt: string | null; isStale: boolean } {
  const { reports, issues, assets, annotations, auditId } = input;

  const lastExport =
    reports
      .filter((r) => r.auditId === auditId && !r.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

  const auditIssues = issues.filter((i) => i.auditId === auditId);
  const issueIds = new Set(auditIssues.map((i) => i.id));
  const auditAssets = assets.filter((a) => a.auditId === auditId);
  const auditAnnotations = annotations.filter((an) => issueIds.has(an.issueId));

  const contentUpdatedAt = [...auditIssues, ...auditAssets, ...auditAnnotations].reduce<string | null>(
    (acc, r) => (acc === null || r.updatedAt > acc ? r.updatedAt : acc),
    null,
  );

  const isStale = !!lastExport && !!contentUpdatedAt && contentUpdatedAt > lastExport.createdAt;
  return { lastExport, contentUpdatedAt, isStale };
}
