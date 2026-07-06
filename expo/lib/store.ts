/**
 * Local-first persistence layer.
 *
 * AsyncStorage-backed JSON tables act as the on-device source of truth.
 * The table shapes (and sync fields on every record) are designed so this
 * driver can be swapped for SQLite + a real sync engine later without
 * touching UI code.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

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

const KEY_PREFIX = "caiq:";

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

async function loadTable<T>(name: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${name}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.log(`[store] failed loading table ${name}`, e);
    return [];
  }
}

export async function loadDb(): Promise<Db> {
  const [projects, locations, assignees, audits, issues, assets, annotations, reports, outbox] =
    await Promise.all([
      loadTable<Project>("projects"),
      loadTable<ProjectLocation>("locations"),
      loadTable<Assignee>("assignees"),
      loadTable<Audit>("audits"),
      loadTable<Issue>("issues"),
      loadTable<PhotoAsset>("assets"),
      loadTable<AnnotationRecord>("annotations"),
      loadTable<ReportExport>("reports"),
      loadTable<OutboxEntry>("outbox"),
    ]);
  return { projects, locations, assignees, audits, issues, assets, annotations, reports, outbox };
}

export async function saveDb(db: Db): Promise<void> {
  try {
    const pairs: [string, string][] = TABLE_NAMES.map((t) => [
      `${KEY_PREFIX}${t}`,
      JSON.stringify(db[t]),
    ]);
    await AsyncStorage.multiSet(pairs);
  } catch (e) {
    console.log("[store] failed saving db", e);
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}settings`);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    console.log("[store] failed loading settings", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(`${KEY_PREFIX}settings`, JSON.stringify(settings));
  } catch (e) {
    console.log("[store] failed saving settings", e);
  }
}

export async function clearAllData(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(KEY_PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch (e) {
    console.log("[store] failed clearing data", e);
  }
}
