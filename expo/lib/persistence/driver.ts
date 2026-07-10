/**
 * StorageDriver — adapter boundary for local persistence.
 *
 * Wave 1 ships AsyncStorageDriver. Wave 2 can swap in a SQLite driver
 * without changing AppStore / UI code (see README.md).
 */

import type { AppSettings } from "@/types/models";
import type { Db } from "@/lib/store";

export type TableName = keyof Db;

export interface TableLoadResult<T> {
  data: T[];
  /** Set when stored JSON was corrupt / unreadable; data falls back to []. */
  warning?: string;
}

export interface StorageDriver {
  loadTable<T>(name: TableName): Promise<TableLoadResult<T>>;
  /** Persist only the named tables (full JSON rewrite per table). */
  saveTables(db: Db, tables: TableName[]): Promise<void>;
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  clearAll(): Promise<void>;
}
