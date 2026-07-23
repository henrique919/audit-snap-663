/**
 * One-time local → cloud import.
 *
 * When a user signs in on a device that already has local-only data (the
 * common case: they used the app offline before creating an account), every
 * pre-existing record needs to be queued for push exactly once. This just
 * enqueues outbox entries — the regular sync engine (syncEngine.ts) does the
 * actual pushing, ordering, retrying, and media upload.
 *
 * `cloudImportCheckpoint` tracks which tables have already been enqueued so
 * a partial failure (app killed mid-import, offline, etc.) can resume
 * without re-queuing tables that already succeeded. Enqueuing itself is also
 * idempotent — the outbox de-dupes by (table, recordId) via
 * lib/persistence/outbox.ts — so re-running a table that was already queued
 * is harmless, just wasted work.
 */

import { newId, nowIso } from "@/lib/ids";
import type { Db } from "@/lib/store";
import { PUSH_TABLE_ORDER, type PushTableName } from "@/lib/supabase/syncOrder";
import type { AppSettings, OutboxEntry } from "@/types/models";

/** Keyed by `PushTableName`; typed loosely (matches `AppSettings.cloudImportCheckpoint`). */
export type LocalImportCheckpoint = Record<string, boolean>;

function pendingTables(checkpoint: LocalImportCheckpoint | null | undefined): PushTableName[] {
  return PUSH_TABLE_ORDER.filter((table) => checkpoint?.[table] !== true);
}

/** Any pre-existing local record, in a table not yet marked imported, that isn't already covered? */
export function detectNeedsImport(
  settings: Pick<AppSettings, "cloudImportCompletedAt" | "cloudImportCheckpoint">,
  db: Db,
): boolean {
  if (settings.cloudImportCompletedAt) return false;
  return pendingTables(settings.cloudImportCheckpoint).some((table) => db[table].length > 0);
}

export function isImportComplete(checkpoint: LocalImportCheckpoint | null | undefined): boolean {
  return pendingTables(checkpoint).length === 0;
}

export interface ImportBatchResult {
  entries: OutboxEntry[];
  checkpoint: LocalImportCheckpoint;
}

/**
 * Build outbox "create" entries for every not-yet-imported table's current
 * records, and return the checkpoint with those tables marked done. Caller
 * is expected to append `entries` to the outbox and persist `checkpoint`
 * into settings (see the top of runSyncCycle in lib/supabase/syncEngine.ts,
 * which runs this before every push so the first sync after sign-in queues
 * everything pre-existing on the device).
 */
export function buildImportOutboxBatch(db: Db, checkpoint: LocalImportCheckpoint | null | undefined): ImportBatchResult {
  const nextCheckpoint: LocalImportCheckpoint = { ...checkpoint };
  const entries: OutboxEntry[] = [];
  const at = nowIso();

  for (const table of pendingTables(checkpoint)) {
    const records = db[table] as readonly { id: string }[];
    for (const record of records) {
      entries.push({ id: newId(), table, recordId: record.id, op: "create", at, updatedAt: at });
    }
    nextCheckpoint[table] = true;
  }

  return { entries, checkpoint: nextCheckpoint };
}

export function markImportCompleted(): Pick<AppSettings, "cloudImportCompletedAt" | "cloudImportCheckpoint"> {
  return { cloudImportCompletedAt: nowIso(), cloudImportCheckpoint: null };
}
