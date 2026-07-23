/**
 * Sync conflict detection + resolution.
 *
 * The server schema doesn't enforce optimistic-concurrency (no compare-and-
 * swap on `server_version`), so conflicts are resolved client-side: a
 * record is only "in conflict" when this device has an unpushed local edit
 * AND the remote row changed since the last successful sync of this record.
 * Otherwise, whichever side is strictly newer (by `updatedAt`) simply wins —
 * that's the common case (only one side changed).
 */

import type { SyncStatus } from "@/types/models";

export interface VersionedRecord {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  localVersion: number;
  serverVersion: number;
}

export interface ConflictCheckInput<T extends VersionedRecord> {
  local: T;
  remote: T;
  /**
   * `serverVersion` recorded locally the last time this exact record was
   * successfully pushed or pulled. `null` when the record has never
   * round-tripped (e.g. it arrived on pull for the first time).
   */
  lastSyncedServerVersion: number | null;
}

export type ConflictOutcome = "use-local" | "use-remote" | "conflict";

export interface ConflictResolution<T> {
  outcome: ConflictOutcome;
  record: T;
  reason?: string;
}

/** Has this device made an edit that hasn't been confirmed synced yet? */
export function hasUnpushedLocalChange(local: Pick<VersionedRecord, "syncStatus">): boolean {
  return local.syncStatus === "pending_upload" || local.syncStatus === "error" || local.syncStatus === "conflict";
}

/** Did the remote row change since the last time we synced this record? */
export function hasRemoteChangeSinceLastSync<T extends VersionedRecord>(
  remote: T,
  lastSyncedServerVersion: number | null,
): boolean {
  return lastSyncedServerVersion == null || remote.serverVersion > lastSyncedServerVersion;
}

/** True only when both sides changed independently since the last sync. */
export function detectConflict<T extends VersionedRecord>(input: ConflictCheckInput<T>): boolean {
  const { local, remote, lastSyncedServerVersion } = input;
  if (local.id !== remote.id) return false;
  if (!hasUnpushedLocalChange(local)) return false;
  if (!hasRemoteChangeSinceLastSync(remote, lastSyncedServerVersion)) return false;
  // Both "changed" but landed on the identical timestamp (e.g. a retried push
  // echoing the same edit back) — not a real conflict.
  return remote.updatedAt !== local.updatedAt;
}

/**
 * Decide which side of a pulled record should win locally.
 *
 * - No conflict: the strictly-newer `updatedAt` wins (ties keep local, since
 *   an identical timestamp on both sides means nothing new happened remotely).
 * - Conflict: most-recent edit wins (still a real decision, not a guess),
 *   but the result is flagged `syncStatus: "conflict"` so the UI can surface
 *   it later instead of silently discarding the losing edit's existence.
 */
export function resolveConflict<T extends VersionedRecord>(input: ConflictCheckInput<T>): ConflictResolution<T> {
  const { local, remote } = input;

  if (!detectConflict(input)) {
    if (remote.updatedAt > local.updatedAt) {
      return { outcome: "use-remote", record: remote };
    }
    return { outcome: "use-local", record: local };
  }

  const winner = remote.updatedAt >= local.updatedAt ? remote : { ...local, serverVersion: remote.serverVersion };
  return {
    outcome: "conflict",
    record: { ...winner, syncStatus: "conflict" as SyncStatus },
    reason: "Both local and remote changed since the last sync; the most recent edit was kept.",
  };
}
