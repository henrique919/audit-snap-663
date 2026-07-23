/**
 * Local-first persistence facade.
 *
 * Thin wrapper over a StorageDriver (AsyncStorage by default). Table shapes
 * and sync fields are designed so a SQLite driver can slot in later without
 * touching UI code — see lib/persistence/README.md.
 */

import type {
  AnnotationRecord,
  AppSettings,
  Assignee,
  Audit,
  Issue,
  OutboxEntry,
  PhotoAsset,
  Project,
  ProjectLocation,
  ReportExport,
} from "@/types/models";
import { DEFAULT_SETTINGS } from "@/types/models";
import { defaultDriver } from "@/lib/persistence/asyncStorageDriver";
import { createIndexedDbStorageDriver } from "@/lib/persistence/indexedDbDriver";
import type { StorageDriver, TableName } from "@/lib/persistence/driver";
import { compactOutbox } from "@/lib/persistence/outbox";
import { errorMessage, withRetry } from "@/lib/persistence/retry";
import type { PersistResult } from "@/lib/persistence/types";
import { Platform } from "react-native";

export type { PersistResult } from "@/lib/persistence/types";

export interface Db {
  projects: Project[];
  locations: ProjectLocation[];
  assignees: Assignee[];
  audits: Audit[];
  issues: Issue[];
  assets: PhotoAsset[];
  annotations: AnnotationRecord[];
  reports: ReportExport[];
  outbox: OutboxEntry[];
}

export const EMPTY_DB: Db = {
  projects: [],
  locations: [],
  assignees: [],
  audits: [],
  issues: [],
  assets: [],
  annotations: [],
  reports: [],
  outbox: [],
};

export const TABLE_NAMES: (keyof Db)[] = [
  "projects",
  "locations",
  "assignees",
  "audits",
  "issues",
  "assets",
  "annotations",
  "reports",
  "outbox",
];

export interface LoadDbResult {
  db: Db;
  /** One-time hydration warnings (corrupt JSON, etc.). */
  warnings: string[];
}

let driver: StorageDriver =
  Platform.OS === "web" && typeof indexedDB !== "undefined"
    ? createIndexedDbStorageDriver()
    : defaultDriver;

/** Test / Wave-2 hook — swap the underlying storage implementation. */
export function setStorageDriver(next: StorageDriver): void {
  driver = next;
}

export function getStorageDriver(): StorageDriver {
  return driver;
}

export async function loadDb(): Promise<Db> {
  const result = await loadDbDetailed();
  return result.db;
}

export async function loadDbDetailed(): Promise<LoadDbResult> {
  const warnings: string[] = [];
  const results = await Promise.all(
    TABLE_NAMES.map(async (name) => {
      const loaded = await driver.loadTable(name);
      if (loaded.warning) warnings.push(loaded.warning);
      return [name, loaded.data] as const;
    }),
  );

  const db: Db = {
    projects: [],
    locations: [],
    assignees: [],
    audits: [],
    issues: [],
    assets: [],
    annotations: [],
    reports: [],
    outbox: [],
  };
  for (const [name, data] of results) {
    switch (name) {
      case "projects":
        db.projects = data as Project[];
        break;
      case "locations":
        db.locations = data as ProjectLocation[];
        break;
      case "assignees":
        db.assignees = data as Assignee[];
        break;
      case "audits":
        db.audits = data as Audit[];
        break;
      case "issues":
        db.issues = data as Issue[];
        break;
      case "assets":
        db.assets = data as PhotoAsset[];
        break;
      case "annotations":
        db.annotations = data as AnnotationRecord[];
        break;
      case "reports":
        db.reports = data as ReportExport[];
        break;
      case "outbox":
        db.outbox = data as OutboxEntry[];
        break;
    }
  }

  // Compact legacy outboxes (duplicates / former 200-cap dumps) on load.
  db.outbox = compactOutbox(db.outbox as OutboxEntry[]);

  return { db, warnings };
}

export async function saveDb(db: Db, tables: TableName[] = TABLE_NAMES): Promise<PersistResult> {
  const unique = Array.from(new Set(tables));
  try {
    await withRetry(() => driver.saveTables(db, unique));
    return { ok: true };
  } catch (e) {
    const error = errorMessage(e);
    console.log("[store] failed saving db", e);
    return { ok: false, error };
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    return await driver.loadSettings();
  } catch (e) {
    console.log("[store] failed loading settings", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<PersistResult> {
  try {
    await withRetry(() => driver.saveSettings(settings));
    return { ok: true };
  } catch (e) {
    const error = errorMessage(e);
    console.log("[store] failed saving settings", e);
    return { ok: false, error };
  }
}

export async function clearAllData(): Promise<PersistResult> {
  try {
    await withRetry(() => driver.clearAll());
    return { ok: true };
  } catch (e) {
    const error = errorMessage(e);
    console.log("[store] failed clearing data", e);
    return { ok: false, error };
  }
}

/** Diff table references — used by AppStore dirty-table tracking. */
export function dirtyTables(prev: Db, next: Db): TableName[] {
  return TABLE_NAMES.filter((t) => prev[t] !== next[t]);
}
