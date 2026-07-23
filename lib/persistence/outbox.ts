/**
 * Outbox compaction — keep at most one live entry per (table, recordId).
 *
 * Rules:
 * - create followed by update(s) → single create with latest timestamp
 * - any op followed by delete → delete, OR drop entirely when the record
 *   was never synced (create still in the outbox / local_only path)
 * - delete must never be replaced by a later update
 */

import type { OutboxEntry, OutboxOperation } from "@/types/models";

function keyOf(entry: Pick<OutboxEntry, "table" | "recordId">): string {
  return `${entry.table}\0${entry.recordId}`;
}

function stamp(entry: OutboxEntry): string {
  return entry.updatedAt ?? entry.at;
}

function withStamp(entry: OutboxEntry, at: string): OutboxEntry {
  return { ...entry, at, updatedAt: at };
}

/**
 * Merge a single incoming op into an existing compacted entry for the same record.
 * Returns `null` when both should be dropped (create + delete, never synced).
 */
export function mergeOutboxEntry(
  existing: OutboxEntry | undefined,
  incoming: OutboxEntry,
): OutboxEntry | null {
  if (!existing) {
    return { ...incoming, updatedAt: incoming.updatedAt ?? incoming.at };
  }

  const nextAt = stamp(incoming);
  const op = incoming.op;

  if (op === "delete") {
    // Never-synced local create (possibly compacted with updates) → drop.
    if (existing.op === "create") return null;
    return withStamp({ ...incoming, op: "delete" }, nextAt);
  }

  // delete must never be replaced by an older/newer update or create.
  if (existing.op === "delete") {
    return existing;
  }

  if (op === "create") {
    // Unusual re-create after update: keep create with latest stamp.
    return withStamp({ ...incoming, op: "create" }, nextAt);
  }

  // incoming update
  if (existing.op === "create") {
    return withStamp({ ...existing, op: "create" }, nextAt);
  }

  return withStamp({ ...incoming, op: "update" }, nextAt);
}

/** Compact a full outbox (e.g. legacy installs with duplicates / >200 entries). */
export function compactOutbox(entries: OutboxEntry[]): OutboxEntry[] {
  const map = new Map<string, OutboxEntry>();
  const order: string[] = [];

  for (const raw of entries) {
    if (!raw || typeof raw.table !== "string" || typeof raw.recordId !== "string") continue;
    const op = raw.op as OutboxOperation;
    if (op !== "create" && op !== "update" && op !== "delete") continue;

    const entry: OutboxEntry = {
      id: raw.id,
      table: raw.table,
      recordId: raw.recordId,
      op,
      at: typeof raw.at === "string" ? raw.at : new Date(0).toISOString(),
      ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
    };

    const key = keyOf(entry);
    const merged = mergeOutboxEntry(map.get(key), entry);
    if (merged === null) {
      if (map.has(key)) {
        map.delete(key);
        const idx = order.indexOf(key);
        if (idx >= 0) order.splice(idx, 1);
      }
      continue;
    }
    if (!map.has(key)) order.push(key);
    map.set(key, merged);
  }

  return order.map((k) => map.get(k)!).filter(Boolean);
}

/** Append one or more ops and compact in place (O(live records)). */
export function appendOutbox(
  current: OutboxEntry[],
  additions: OutboxEntry | OutboxEntry[],
): OutboxEntry[] {
  const list = Array.isArray(additions) ? additions : [additions];
  if (list.length === 0) return current;
  // Cheap path: start from already-compacted current when possible.
  const base = current.length > 0 ? compactOutbox(current) : [];
  return compactOutbox([...base, ...list]);
}
