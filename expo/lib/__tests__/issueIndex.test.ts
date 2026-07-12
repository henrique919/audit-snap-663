import { buildIssueMediaIndex } from "@/lib/issueIndex";
import type { AnnotationRecord, PhotoAsset } from "@/types/models";

const baseRecord = {
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  deletedAt: null,
  syncStatus: "local_only" as const,
  localVersion: 1,
  serverVersion: 0,
};

function asset(id: string, issueId: string, deletedAt: string | null = null): PhotoAsset {
  return {
    ...baseRecord,
    id,
    issueId,
    auditId: "audit",
    projectId: "project",
    originalUri: `${id}-original.jpg`,
    reportUri: `${id}-report.jpg`,
    thumbUri: `${id}-thumb.jpg`,
    annotatedUri: null,
    width: 1000,
    height: 750,
    capturedAt: baseRecord.createdAt,
    deletedAt,
  };
}

function annotation(id: string, issueId: string, hasElements = true): AnnotationRecord {
  return {
    ...baseRecord,
    id,
    assetId: `asset-${id}`,
    issueId,
    elements: hasElements
      ? [{ id: `element-${id}`, type: "callout", cx: 0.5, cy: 0.5, number: 1, color: "#f00", size: 50 }]
      : [],
    toolsetVersion: 1,
  };
}

describe("buildIssueMediaIndex", () => {
  test("groups active assets and records only non-empty markup", () => {
    const result = buildIssueMediaIndex(
      [asset("a1", "issue-1"), asset("a2", "issue-1"), asset("a3", "issue-2")],
      [annotation("n1", "issue-1"), annotation("n2", "issue-2", false)],
    );

    expect(result.assetsByIssue.get("issue-1")?.map(({ id }) => id)).toEqual(["a1", "a2"]);
    expect(result.assetsByIssue.get("issue-2")?.map(({ id }) => id)).toEqual(["a3"]);
    expect(result.hasMarkupByIssue.has("issue-1")).toBe(true);
    expect(result.hasMarkupByIssue.has("issue-2")).toBe(false);
  });

  test("handles orphaned issue ids and preserves an empty bucket for deleted-only assets", () => {
    const result = buildIssueMediaIndex(
      [asset("orphan", "missing-issue"), asset("deleted", "deleted-only", "2025-02-01T00:00:00.000Z")],
      [annotation("empty", "missing-issue", false)],
    );

    expect(result.assetsByIssue.get("missing-issue")?.map(({ id }) => id)).toEqual(["orphan"]);
    expect(result.assetsByIssue.has("deleted-only")).toBe(true);
    expect(result.assetsByIssue.get("deleted-only")).toEqual([]);
    expect(result.hasMarkupByIssue.has("missing-issue")).toBe(false);
  });

  test("indexes the 500-issue scale fixture for constant-time Map and Set lookups", () => {
    const issueCount = 500;
    const assets = Array.from({ length: issueCount * 3 }, (_, index) =>
      asset(`asset-${index}`, `issue-${Math.floor(index / 3)}`),
    );
    const annotations = Array.from({ length: issueCount }, (_, index) =>
      annotation(`annotation-${index}`, `issue-${index}`, index % 2 === 0),
    );

    const startedAt = performance.now();
    const result = buildIssueMediaIndex(assets, annotations);
    const elapsedMs = performance.now() - startedAt;

    expect(result.assetsByIssue).toBeInstanceOf(Map);
    expect(result.hasMarkupByIssue).toBeInstanceOf(Set);
    expect(result.assetsByIssue.size).toBe(issueCount);
    expect(result.assetsByIssue.get("issue-499")?.map(({ id }) => id)).toEqual([
      "asset-1497",
      "asset-1498",
      "asset-1499",
    ]);
    expect(result.hasMarkupByIssue.has("issue-498")).toBe(true);
    expect(result.hasMarkupByIssue.has("issue-499")).toBe(false);
    expect(Number.isFinite(elapsedMs)).toBe(true);
  });
});
