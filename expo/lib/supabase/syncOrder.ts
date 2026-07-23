/**
 * Push ordering for cloud sync.
 *
 * Local table names (Db keys) must be pushed parent-before-child on
 * create/update (foreign keys are NOT NULL on child rows) and child-before-
 * parent on delete (belt-and-suspenders — Postgres FKs already cascade, but
 * pushing leaves first avoids relying on that under retry/partial-failure).
 */

import type { Database } from "@/lib/supabase/database.types";
import type { OutboxEntry } from "@/types/models";

/** Db keys in parent→child dependency order. Excludes `outbox` (not a synced table). */
export const PUSH_TABLE_ORDER = [
  "projects",
  "locations",
  "assignees",
  "audits",
  "issues",
  "assets",
  "annotations",
  "reports",
] as const;

export type PushTableName = (typeof PUSH_TABLE_ORDER)[number];

/** Maps local Db keys to their Supabase table name. */
export const REMOTE_TABLE_NAME: Record<PushTableName, keyof Database["public"]["Tables"]> = {
  projects: "projects",
  locations: "project_locations",
  assignees: "assignees",
  audits: "audits",
  issues: "issues",
  assets: "photo_assets",
  annotations: "annotation_records",
  reports: "report_exports",
};

const RANK: Record<string, number> = PUSH_TABLE_ORDER.reduce<Record<string, number>>((acc, table, index) => {
  acc[table] = index;
  return acc;
}, {});

export function isPushTableName(table: string): table is PushTableName {
  return table in RANK;
}

/** Parent-first rank for creates/updates; unknown tables sort last. */
export function tableRank(table: string): number {
  return RANK[table] ?? PUSH_TABLE_ORDER.length;
}

/** Child-first rank for deletes — the mirror image of `tableRank`. */
function reverseTableRank(table: string): number {
  const rank = RANK[table];
  return rank == null ? PUSH_TABLE_ORDER.length : PUSH_TABLE_ORDER.length - 1 - rank;
}

function effectiveRank(entry: OutboxEntry): number {
  return entry.op === "delete" ? reverseTableRank(entry.table) : tableRank(entry.table);
}

/**
 * Order outbox entries for push: parent-before-child for create/update,
 * child-before-parent for delete; ties broken by timestamp then id so the
 * sort is stable and deterministic for tests.
 */
export function compareOutboxEntries(a: OutboxEntry, b: OutboxEntry): number {
  const rankDiff = effectiveRank(a) - effectiveRank(b);
  if (rankDiff !== 0) return rankDiff;
  const stampA = a.updatedAt ?? a.at;
  const stampB = b.updatedAt ?? b.at;
  if (stampA !== stampB) return stampA < stampB ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function sortOutboxForPush(entries: OutboxEntry[]): OutboxEntry[] {
  return [...entries].sort(compareOutboxEntries);
}
