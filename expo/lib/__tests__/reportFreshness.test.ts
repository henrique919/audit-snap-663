import { computeReportFreshness } from "@/lib/reportFreshness";
import type { AnnotationRecord, Issue, PhotoAsset, ReportExport } from "@/types/models";

function base(id: string, updatedAt: string) {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null as string | null,
    syncStatus: "local_only" as const,
    localVersion: 1,
    serverVersion: 1,
  };
}

function issue(id: string, auditId: string, updatedAt: string, deletedAt: string | null = null): Issue {
  return {
    ...base(id, updatedAt),
    deletedAt,
    auditId,
    projectId: "p1",
    locationId: null,
    issueNumber: 1,
    title: "t",
    description: "",
    status: "open",
    priority: "medium",
    assigneeId: null,
    includeInReport: true,
    sortOrder: 0,
  };
}

function asset(id: string, auditId: string, issueId: string, updatedAt: string): PhotoAsset {
  return {
    ...base(id, updatedAt),
    issueId,
    auditId,
    projectId: "p1",
    originalUri: "o",
    reportUri: "r",
    thumbUri: "t",
    annotatedUri: null,
    width: 1,
    height: 1,
    capturedAt: updatedAt,
  };
}

function annotation(id: string, issueId: string, assetId: string, updatedAt: string): AnnotationRecord {
  return {
    ...base(id, updatedAt),
    assetId,
    issueId,
    elements: [],
    toolsetVersion: 1,
  };
}

function report(id: string, auditId: string, createdAt: string): ReportExport {
  return {
    ...base(id, createdAt),
    createdAt,
    auditId,
    projectId: "p1",
    pdfUri: "pdf",
    issueCount: 1,
    photoCount: 1,
    options: {} as ReportExport["options"],
  };
}

describe("computeReportFreshness", () => {
  it("handles no exports", () => {
    const result = computeReportFreshness({
      reports: [],
      issues: [issue("i1", "a1", "2026-01-02T00:00:00.000Z")],
      assets: [],
      annotations: [],
      auditId: "a1",
    });
    expect(result.lastExport).toBeNull();
    expect(result.isStale).toBe(false);
    expect(result.contentUpdatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("marks fresh export as not stale", () => {
    const result = computeReportFreshness({
      reports: [report("r1", "a1", "2026-01-03T00:00:00.000Z")],
      issues: [issue("i1", "a1", "2026-01-02T00:00:00.000Z")],
      assets: [asset("ph1", "a1", "i1", "2026-01-02T12:00:00.000Z")],
      annotations: [],
      auditId: "a1",
    });
    expect(result.lastExport?.id).toBe("r1");
    expect(result.isStale).toBe(false);
  });

  it("is stale via issue update", () => {
    const result = computeReportFreshness({
      reports: [report("r1", "a1", "2026-01-02T00:00:00.000Z")],
      issues: [issue("i1", "a1", "2026-01-03T00:00:00.000Z")],
      assets: [],
      annotations: [],
      auditId: "a1",
    });
    expect(result.isStale).toBe(true);
  });

  it("is stale via annotation update", () => {
    const result = computeReportFreshness({
      reports: [report("r1", "a1", "2026-01-02T00:00:00.000Z")],
      issues: [issue("i1", "a1", "2026-01-01T00:00:00.000Z")],
      assets: [asset("ph1", "a1", "i1", "2026-01-01T00:00:00.000Z")],
      annotations: [annotation("an1", "i1", "ph1", "2026-01-04T00:00:00.000Z")],
      auditId: "a1",
    });
    expect(result.isStale).toBe(true);
    expect(result.contentUpdatedAt).toBe("2026-01-04T00:00:00.000Z");
  });

  it("soft-delete bumps staleness", () => {
    const result = computeReportFreshness({
      reports: [report("r1", "a1", "2026-01-02T00:00:00.000Z")],
      issues: [issue("i1", "a1", "2026-01-05T00:00:00.000Z", "2026-01-05T00:00:00.000Z")],
      assets: [],
      annotations: [],
      auditId: "a1",
    });
    expect(result.isStale).toBe(true);
  });
});
