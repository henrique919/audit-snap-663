import {
  compareOutboxEntries,
  isPushTableName,
  PUSH_TABLE_ORDER,
  REMOTE_TABLE_NAME,
  sortOutboxForPush,
  tableRank,
} from "@/lib/supabase/syncOrder";
import type { OutboxEntry } from "@/types/models";

function entry(table: string, recordId: string, op: OutboxEntry["op"], at = "2026-01-01T00:00:00.000Z"): OutboxEntry {
  return { id: `${table}-${recordId}-${op}`, table, recordId, op, at, updatedAt: at };
}

describe("tableRank / isPushTableName", () => {
  it("ranks tables parent-first", () => {
    expect(tableRank("projects")).toBeLessThan(tableRank("audits"));
    expect(tableRank("audits")).toBeLessThan(tableRank("issues"));
    expect(tableRank("issues")).toBeLessThan(tableRank("assets"));
    expect(tableRank("assets")).toBeLessThan(tableRank("annotations"));
  });

  it("recognises valid push table names only", () => {
    expect(isPushTableName("projects")).toBe(true);
    expect(isPushTableName("outbox")).toBe(false);
    expect(isPushTableName("nonsense")).toBe(false);
  });

  it("maps every local table to its remote name", () => {
    for (const table of PUSH_TABLE_ORDER) {
      expect(typeof REMOTE_TABLE_NAME[table]).toBe("string");
    }
    expect(REMOTE_TABLE_NAME.locations).toBe("project_locations");
    expect(REMOTE_TABLE_NAME.assets).toBe("photo_assets");
    expect(REMOTE_TABLE_NAME.annotations).toBe("annotation_records");
    expect(REMOTE_TABLE_NAME.reports).toBe("report_exports");
  });
});

describe("sortOutboxForPush", () => {
  it("pushes creates/updates parent-before-child", () => {
    const entries = [entry("issues", "i1", "create"), entry("projects", "p1", "create"), entry("audits", "a1", "create")];
    const sorted = sortOutboxForPush(entries).map((e) => e.table);
    expect(sorted).toEqual(["projects", "audits", "issues"]);
  });

  it("pushes deletes child-before-parent", () => {
    const entries = [entry("projects", "p1", "delete"), entry("issues", "i1", "delete"), entry("audits", "a1", "delete")];
    const sorted = sortOutboxForPush(entries).map((e) => e.table);
    expect(sorted).toEqual(["issues", "audits", "projects"]);
  });

  it("mixes creates and deletes independently by op", () => {
    const entries = [
      entry("projects", "p1", "delete"),
      entry("assignees", "as1", "create"),
      entry("issues", "i1", "create"),
    ];
    const sorted = sortOutboxForPush(entries).map((e) => `${e.table}:${e.op}`);
    // creates rank by forward order (assignees before issues); the project delete
    // has a very low reverse-rank (projects is rank 0 → reverse rank is highest number
    // among push tables) so it does not need to precede unrelated creates.
    expect(sorted).toContain("assignees:create");
    expect(sorted).toContain("issues:create");
    expect(sorted).toContain("projects:delete");
    expect(sorted.indexOf("assignees:create")).toBeLessThan(sorted.indexOf("issues:create"));
  });

  it("breaks ties by timestamp then id for determinism", () => {
    const older = entry("projects", "p1", "update", "2026-01-01T00:00:00.000Z");
    const newer = entry("projects", "p2", "update", "2026-01-02T00:00:00.000Z");
    expect(compareOutboxEntries(older, newer)).toBeLessThan(0);
    expect(compareOutboxEntries(newer, older)).toBeGreaterThan(0);

    const sameStampA: OutboxEntry = { ...older, id: "aaa" };
    const sameStampB: OutboxEntry = { ...older, id: "bbb" };
    expect(compareOutboxEntries(sameStampA, sameStampB)).toBeLessThan(0);
  });

  it("does not mutate the input array", () => {
    const entries = [entry("issues", "i1", "create"), entry("projects", "p1", "create")];
    const copy = [...entries];
    sortOutboxForPush(entries);
    expect(entries).toEqual(copy);
  });
});
