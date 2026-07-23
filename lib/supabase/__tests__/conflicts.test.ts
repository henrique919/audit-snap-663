import {
  detectConflict,
  hasRemoteChangeSinceLastSync,
  hasUnpushedLocalChange,
  resolveConflict,
  VersionedRecord,
} from "@/lib/supabase/conflicts";

function record(overrides: Partial<VersionedRecord> = {}): VersionedRecord {
  return {
    id: "rec-1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    syncStatus: "synced",
    localVersion: 1,
    serverVersion: 1,
    ...overrides,
  };
}

describe("hasUnpushedLocalChange", () => {
  it("is true for pending_upload / error / conflict, false for synced / local_only", () => {
    expect(hasUnpushedLocalChange({ syncStatus: "pending_upload" })).toBe(true);
    expect(hasUnpushedLocalChange({ syncStatus: "error" })).toBe(true);
    expect(hasUnpushedLocalChange({ syncStatus: "conflict" })).toBe(true);
    expect(hasUnpushedLocalChange({ syncStatus: "synced" })).toBe(false);
    expect(hasUnpushedLocalChange({ syncStatus: "local_only" })).toBe(false);
  });
});

describe("hasRemoteChangeSinceLastSync", () => {
  it("is true when never synced before (null checkpoint)", () => {
    expect(hasRemoteChangeSinceLastSync(record({ serverVersion: 1 }), null)).toBe(true);
  });

  it("compares serverVersion against the checkpoint", () => {
    expect(hasRemoteChangeSinceLastSync(record({ serverVersion: 3 }), 2)).toBe(true);
    expect(hasRemoteChangeSinceLastSync(record({ serverVersion: 2 }), 2)).toBe(false);
  });
});

describe("detectConflict", () => {
  it("is false when local has no unpushed change", () => {
    const local = record({ syncStatus: "synced" });
    const remote = record({ serverVersion: 5, updatedAt: "2026-01-02T00:00:00.000Z" });
    expect(detectConflict({ local, remote, lastSyncedServerVersion: 1 })).toBe(false);
  });

  it("is false when remote hasn't changed since last sync", () => {
    const local = record({ syncStatus: "pending_upload" });
    const remote = record({ serverVersion: 1 });
    expect(detectConflict({ local, remote, lastSyncedServerVersion: 1 })).toBe(false);
  });

  it("is true when both local and remote changed independently", () => {
    const local = record({ syncStatus: "pending_upload", updatedAt: "2026-01-01T12:00:00.000Z" });
    const remote = record({ serverVersion: 2, updatedAt: "2026-01-01T13:00:00.000Z" });
    expect(detectConflict({ local, remote, lastSyncedServerVersion: 1 })).toBe(true);
  });

  it("is false when ids differ", () => {
    const local = record({ id: "a", syncStatus: "pending_upload" });
    const remote = record({ id: "b", serverVersion: 2 });
    expect(detectConflict({ local, remote, lastSyncedServerVersion: 1 })).toBe(false);
  });
});

describe("resolveConflict", () => {
  it("uses remote when remote is strictly newer and there's no real conflict", () => {
    const local = record({ syncStatus: "synced", updatedAt: "2026-01-01T00:00:00.000Z" });
    const remote = record({ serverVersion: 2, updatedAt: "2026-01-02T00:00:00.000Z" });
    const result = resolveConflict({ local, remote, lastSyncedServerVersion: 1 });
    expect(result.outcome).toBe("use-remote");
    expect(result.record).toBe(remote);
  });

  it("uses local when local is newer or equal and there's no real conflict", () => {
    const local = record({ syncStatus: "synced", updatedAt: "2026-01-02T00:00:00.000Z" });
    const remote = record({ serverVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z" });
    const result = resolveConflict({ local, remote, lastSyncedServerVersion: 1 });
    expect(result.outcome).toBe("use-local");
    expect(result.record).toBe(local);
  });

  it("flags a real conflict and keeps the most recent edit, marked syncStatus conflict", () => {
    const local = record({ syncStatus: "pending_upload", updatedAt: "2026-01-01T12:00:00.000Z", localVersion: 2 });
    const remote = record({ serverVersion: 2, updatedAt: "2026-01-01T13:00:00.000Z" });
    const result = resolveConflict({ local, remote, lastSyncedServerVersion: 1 });
    expect(result.outcome).toBe("conflict");
    expect(result.record.updatedAt).toBe(remote.updatedAt);
    expect(result.record.syncStatus).toBe("conflict");
    expect(result.reason).toMatch(/most recent edit/);
  });

  it("in a real conflict, keeps local when local is the more recent edit", () => {
    const local = record({ syncStatus: "pending_upload", updatedAt: "2026-01-01T14:00:00.000Z" });
    const remote = record({ serverVersion: 2, updatedAt: "2026-01-01T13:00:00.000Z" });
    const result = resolveConflict({ local, remote, lastSyncedServerVersion: 1 });
    expect(result.outcome).toBe("conflict");
    expect(result.record.updatedAt).toBe(local.updatedAt);
    expect(result.record.syncStatus).toBe("conflict");
  });
});
