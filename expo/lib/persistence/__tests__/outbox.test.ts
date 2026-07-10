import { appendOutbox, compactOutbox, mergeOutboxEntry } from "@/lib/persistence/outbox";
import type { OutboxEntry } from "@/types/models";

function entry(
  table: string,
  recordId: string,
  op: OutboxEntry["op"],
  at: string,
  id = `${table}-${recordId}-${op}-${at}`,
): OutboxEntry {
  return { id, table, recordId, op, at };
}

describe("outbox compaction", () => {
  it("compacts create→update→update to a single create with latest stamp", () => {
    const result = compactOutbox([
      entry("issues", "r1", "create", "2026-01-01T00:00:00.000Z"),
      entry("issues", "r1", "update", "2026-01-01T00:01:00.000Z"),
      entry("issues", "r1", "update", "2026-01-01T00:02:00.000Z"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.op).toBe("create");
    expect(result[0]?.updatedAt ?? result[0]?.at).toBe("2026-01-01T00:02:00.000Z");
  });

  it("drops create→delete for never-synced local_only records", () => {
    const result = compactOutbox([
      entry("issues", "r1", "create", "2026-01-01T00:00:00.000Z"),
      entry("issues", "r1", "delete", "2026-01-01T00:01:00.000Z"),
    ]);
    expect(result).toHaveLength(0);
  });

  it("never lets update replace a delete", () => {
    const deleted = entry("issues", "r1", "delete", "2026-01-01T00:01:00.000Z");
    const merged = mergeOutboxEntry(deleted, entry("issues", "r1", "update", "2026-01-01T00:02:00.000Z"));
    expect(merged?.op).toBe("delete");
    expect(merged?.at).toBe(deleted.at);
  });

  it("compacts 500 mixed ops on 50 records to ≤ 50 entries", () => {
    const ops: OutboxEntry[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `rec-${i}`;
      ops.push(entry("issues", id, "create", `2026-01-01T00:00:00.${String(i).padStart(3, "0")}Z`));
      for (let u = 0; u < 9; u++) {
        ops.push(
          entry(
            "issues",
            id,
            "update",
            `2026-01-01T01:${String(u).padStart(2, "0")}:00.${String(i).padStart(3, "0")}Z`,
          ),
        );
      }
      // 10 ops per record × 50 = 500
    }
    expect(ops).toHaveLength(500);
    const compacted = compactOutbox(ops);
    expect(compacted.length).toBeLessThanOrEqual(50);
    expect(compacted).toHaveLength(50);
    expect(compacted.every((e) => e.op === "create")).toBe(true);
  });

  it("compacts legacy dumps with duplicates and >200 entries", () => {
    const legacy: OutboxEntry[] = [];
    for (let i = 0; i < 250; i++) {
      legacy.push(entry("assets", `a-${i % 10}`, i % 3 === 0 ? "create" : "update", `t-${i}`));
    }
    const compacted = compactOutbox(legacy);
    expect(compacted.length).toBeLessThanOrEqual(10);
  });

  it("appendOutbox stays O(live records)", () => {
    let box: OutboxEntry[] = [];
    for (let i = 0; i < 20; i++) {
      box = appendOutbox(box, entry("projects", `p-${i}`, "create", `c-${i}`));
      box = appendOutbox(box, entry("projects", `p-${i}`, "update", `u-${i}`));
    }
    expect(box).toHaveLength(20);
  });

  it("tolerates missing updatedAt on load", () => {
    const legacy = [{ id: "1", table: "issues", recordId: "x", op: "update" as const, at: "t1" }];
    expect(compactOutbox(legacy)).toHaveLength(1);
  });
});
