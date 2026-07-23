import { EMPTY_DB, type Db } from "@/lib/store";
import {
  buildImportOutboxBatch,
  detectNeedsImport,
  isImportComplete,
  markImportCompleted,
} from "@/lib/supabase/localImport";
import type { Project } from "@/types/models";

function project(id: string): Project {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    syncStatus: "local_only",
    localVersion: 1,
    serverVersion: 1,
    name: `Project ${id}`,
    reference: "",
    clientName: "",
    siteAddress: "",
    companyName: "",
    inspectorName: "",
    coverPhotoUri: null,
    logoUri: null,
    status: "active",
  };
}

describe("detectNeedsImport", () => {
  it("is false once cloudImportCompletedAt is set", () => {
    const db: Db = { ...EMPTY_DB, projects: [project("p1")] };
    expect(detectNeedsImport({ cloudImportCompletedAt: "2026-01-01T00:00:00.000Z", cloudImportCheckpoint: null }, db)).toBe(
      false,
    );
  });

  it("is false when there is no local data at all", () => {
    expect(detectNeedsImport({ cloudImportCompletedAt: null, cloudImportCheckpoint: null }, EMPTY_DB)).toBe(false);
  });

  it("is true when there is local data and no completion timestamp", () => {
    const db: Db = { ...EMPTY_DB, projects: [project("p1")] };
    expect(detectNeedsImport({ cloudImportCompletedAt: null, cloudImportCheckpoint: null }, db)).toBe(true);
  });

  it("is false when every table with data is already marked done in the checkpoint", () => {
    const db: Db = { ...EMPTY_DB, projects: [project("p1")] };
    expect(
      detectNeedsImport({ cloudImportCompletedAt: null, cloudImportCheckpoint: { projects: true } }, db),
    ).toBe(false);
  });
});

describe("buildImportOutboxBatch / isImportComplete", () => {
  it("enqueues a create entry for every record in pending tables and marks them done", () => {
    const db: Db = { ...EMPTY_DB, projects: [project("p1"), project("p2")], assignees: [] };
    const { entries, checkpoint } = buildImportOutboxBatch(db, null);

    const projectEntries = entries.filter((e) => e.table === "projects");
    expect(projectEntries).toHaveLength(2);
    expect(projectEntries.every((e) => e.op === "create")).toBe(true);
    expect(new Set(projectEntries.map((e) => e.recordId))).toEqual(new Set(["p1", "p2"]));
    expect(checkpoint.projects).toBe(true);
    expect(isImportComplete(checkpoint)).toBe(true);
  });

  it("skips tables already marked done in the checkpoint (resumable)", () => {
    const db: Db = { ...EMPTY_DB, projects: [project("p1")], assignees: [] };
    const { entries, checkpoint } = buildImportOutboxBatch(db, { projects: true });
    expect(entries.filter((e) => e.table === "projects")).toHaveLength(0);
    expect(checkpoint.projects).toBe(true);
  });

  it("isImportComplete is false while any table lacks data but is unmarked", () => {
    expect(isImportComplete(null)).toBe(false);
    expect(isImportComplete({})).toBe(false);
  });
});

describe("markImportCompleted", () => {
  it("returns a completion timestamp and clears the checkpoint", () => {
    const result = markImportCompleted();
    expect(typeof result.cloudImportCompletedAt).toBe("string");
    expect(result.cloudImportCheckpoint).toBeNull();
  });
});
