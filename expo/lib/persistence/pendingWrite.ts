/** Helpers for preserving the newest snapshot when a persistence batch fails. */

export interface PendingWrite<TSnapshot, TTable> {
  snapshot: TSnapshot | null;
  epoch: number;
  tables: Iterable<TTable>;
}

/**
 * Re-queue a failed batch without overwriting mutations queued during retry.
 * The newest pending snapshot wins, while both batches' dirty tables are kept.
 */
export function mergeFailedWrite<TSnapshot, TTable>(
  pending: PendingWrite<TSnapshot, TTable>,
  failed: { snapshot: TSnapshot; epoch: number; tables: Iterable<TTable> },
): { snapshot: TSnapshot; epoch: number; tables: Set<TTable> } {
  const hasNewerSnapshot = pending.snapshot !== null;
  return {
    snapshot: pending.snapshot ?? failed.snapshot,
    epoch: hasNewerSnapshot ? pending.epoch : failed.epoch,
    tables: new Set([...pending.tables, ...failed.tables]),
  };
}
