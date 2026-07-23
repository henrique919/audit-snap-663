import { syncEngineInternals } from "@/lib/supabase/syncEngine";
import { EMPTY_DB, type Db } from "@/lib/store";

describe("sync engine concurrency guards", () => {
  it("does not reuse a stale native file after the remote media reference changes", () => {
    expect(
      syncEngineInternals.matchingLocalMediaUri(
        "supabase://project-media/user/project/v1/cover.jpg",
        "file:///docs/cloud-cache/v1-cover.jpg",
        "supabase://project-media/user/project/v2/cover.jpg",
      ),
    ).toBeUndefined();
    expect(
      syncEngineInternals.matchingLocalMediaUri(
        "supabase://project-media/user/project/v2/cover.jpg",
        "file:///docs/cloud-cache/v2-cover.jpg",
        "supabase://project-media/user/project/v2/cover.jpg",
      ),
    ).toBe("file:///docs/cloud-cache/v2-cover.jpg");
  });

  it("rejects an update when the remote version changed", async () => {
    const insert = jest.fn();
    const update = jest.fn();
    const result = await syncEngineInternals.versionCheckedWrite(
      3,
      async () => ({ data: { server_version: 4 }, error: null }),
      insert,
      update,
    );

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ status: 409, code: "SYNC_VERSION_CONFLICT" });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("inserts a row that does not exist remotely", async () => {
    const inserted = { data: { server_version: 1 }, error: null };
    const insert = jest.fn(async () => inserted);
    const result = await syncEngineInternals.versionCheckedWrite(
      1,
      async () => ({ data: null, error: null }),
      insert,
      jest.fn(),
    );

    expect(result).toBe(inserted);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("paginates without dropping the boundary row", async () => {
    const allRows = Array.from({ length: 501 }, (_, index) => ({
      id: `row-${index}`,
      updated_at: "2026-07-19T00:00:00.000Z",
    }));
    const ranges: [number, number][] = [];
    const rows = await syncEngineInternals.fetchChangedRows(
      async (_since, from, to) => {
        ranges.push([from, to]);
        return { data: allRows.slice(from, to + 1), error: null };
      },
      "1970-01-01T00:00:00.000Z",
    );

    expect(rows).toHaveLength(501);
    expect(rows[500]?.id).toBe("row-500");
    expect(ranges).toEqual([[0, 499], [500, 999]]);
  });
});

describe("fresh-device demo cleanup", () => {
  it("detects the owner embedded in legacy private Storage references", () => {
    const db = {
      ...EMPTY_DB,
      projects: [
        {
          id: "legacy",
          coverPhotoUri: "supabase://project-media/owner-a/project/cover.jpg",
          logoUri: null,
        },
      ],
    } as unknown as Db;

    expect(Array.from(syncEngineInternals.inferLegacyCloudOwners(db, { logoUri: null } as never))).toEqual([
      "owner-a",
    ]);
  });

  it("removes the bundled SAMPLE graph without touching real local records", () => {
    const db = {
      ...EMPTY_DB,
      projects: [
        { id: "sample-project", reference: "HVA-ST2-2026", name: "Sample — Harbourview Apartments Stage 2" },
        { id: "real-project", reference: "REAL", name: "Real project" },
      ],
      locations: [{ id: "sample-location", projectId: "sample-project" }],
      assignees: [{ id: "sample-assignee" }, { id: "real-assignee" }],
      audits: [{ id: "sample-audit", projectId: "sample-project" }],
      issues: [
        { id: "sample-issue", projectId: "sample-project", assigneeId: "sample-assignee" },
        { id: "real-issue", projectId: "real-project", assigneeId: "real-assignee" },
      ],
      assets: [{ id: "sample-asset", projectId: "sample-project" }],
      annotations: [{ id: "sample-annotation", issueId: "sample-issue", assetId: "sample-asset" }],
      reports: [{ id: "sample-report", projectId: "sample-project" }],
      outbox: [
        { id: "o1", table: "reports", recordId: "sample-report", op: "create", at: "2026-07-19T00:00:00.000Z" },
        { id: "o2", table: "projects", recordId: "real-project", op: "create", at: "2026-07-19T00:00:00.000Z" },
      ],
    } as unknown as Db;

    const result = syncEngineInternals.stripBundledDemo(db).db;
    expect(result.projects.map((record) => record.id)).toEqual(["real-project"]);
    expect(result.issues.map((record) => record.id)).toEqual(["real-issue"]);
    expect(result.assignees.map((record) => record.id)).toEqual(["real-assignee"]);
    expect(result.reports).toEqual([]);
    expect(result.outbox.map((entry) => entry.recordId)).toEqual(["real-project"]);
  });
});
