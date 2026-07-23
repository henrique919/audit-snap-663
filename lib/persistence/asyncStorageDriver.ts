/**
 * Default StorageDriver — AsyncStorage JSON tables under the `caiq:` prefix.
 * Key names are stable so existing installs keep their data.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AppSettings } from "@/types/models";
import { DEFAULT_SETTINGS } from "@/types/models";
import type { Db } from "@/lib/store";
import type { StorageDriver, TableLoadResult, TableName } from "@/lib/persistence/driver";

export const KEY_PREFIX = "caiq:";

export function createAsyncStorageDriver(
  storage: Pick<typeof AsyncStorage, "getItem" | "setItem" | "multiSet" | "getAllKeys" | "multiRemove"> = AsyncStorage,
): StorageDriver {
  return {
    async loadTable<T>(name: TableName): Promise<TableLoadResult<T>> {
      try {
        const raw = await storage.getItem(`${KEY_PREFIX}${name}`);
        if (!raw) return { data: [] };
        const parsed = JSON.parse(raw) as T[];
        if (!Array.isArray(parsed)) {
          return {
            data: [],
            warning: `Table "${name}" was not a JSON array and was reset.`,
          };
        }
        return { data: parsed };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`[store] failed loading table ${name}`, e);
        return {
          data: [],
          warning: `Table "${name}" could not be read (${msg}) and was reset.`,
        };
      }
    },

    async saveTables(db: Db, tables: TableName[]): Promise<void> {
      if (tables.length === 0) return;
      const pairs: [string, string][] = tables.map((t) => [
        `${KEY_PREFIX}${t}`,
        JSON.stringify(db[t]),
      ]);
      await storage.multiSet(pairs);
    },

    async loadSettings(): Promise<AppSettings> {
      try {
        const raw = await storage.getItem(`${KEY_PREFIX}settings`);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
      } catch (e) {
        console.log("[store] failed loading settings", e);
        return { ...DEFAULT_SETTINGS };
      }
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      await storage.setItem(`${KEY_PREFIX}settings`, JSON.stringify(settings));
    },

    async clearAll(): Promise<void> {
      const keys = await storage.getAllKeys();
      const ours = keys.filter((k) => k.startsWith(KEY_PREFIX));
      if (ours.length > 0) await storage.multiRemove(ours);
    },
  };
}

export const defaultDriver: StorageDriver = createAsyncStorageDriver();
