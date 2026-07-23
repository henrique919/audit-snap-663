import { mergeFailedWrite } from "@/lib/persistence/pendingWrite";

describe("failed persistence batch re-queue", () => {
  it("keeps a newer snapshot queued while the failed batch was retrying", () => {
    const failedSnapshot = { version: 1 };
    const newerSnapshot = { version: 2 };

    const result = mergeFailedWrite(
      { snapshot: newerSnapshot, epoch: 4, tables: ["issues"] },
      { snapshot: failedSnapshot, epoch: 4, tables: ["projects", "outbox"] },
    );

    expect(result.snapshot).toBe(newerSnapshot);
    expect(result.epoch).toBe(4);
    expect(result.tables).toEqual(new Set(["issues", "projects", "outbox"]));
  });

  it("re-queues the failed snapshot when no newer write exists", () => {
    const failedSnapshot = { version: 1 };

    const result = mergeFailedWrite(
      { snapshot: null, epoch: 0, tables: [] },
      { snapshot: failedSnapshot, epoch: 7, tables: ["assets"] },
    );

    expect(result.snapshot).toBe(failedSnapshot);
    expect(result.epoch).toBe(7);
    expect(result.tables).toEqual(new Set(["assets"]));
  });
});
