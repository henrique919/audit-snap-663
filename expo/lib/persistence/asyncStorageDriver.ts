/**
 * Default StorageDriver — AsyncStorage JSON tables under the `caiq:` prefix.
 * Key names are stable so existing installs keep their data.
 *
 * Web media interception: on web, photo payloads are too large for the
 * localStorage-backed tables (the ~5MB per-origin cap fits only a few photos,
 * after which writes fail). The `assets` table is therefore persisted with
 * `idbmedia:` refs while the pixel payloads live in IndexedDB — see
 * webMediaRefs.ts (pure planning logic) and webMediaStore.ts (IDB plumbing).
 * Payloads are written BEFORE the records so a failed payload write rejects
 * the whole save (surfacing through the retry/banner path) instead of
 * persisting dangling refs. Legacy records with inline data URIs migrate
 * automatically on their next save.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type { AppSettings } from "@/types/models";
import { DEFAULT_SETTINGS } from "@/types/models";
import type { Db } from "@/lib/store";
import type { StorageDriver, TableLoadResult, TableName } from "@/lib/persistence/driver";
import type { AssetMediaRecord } from "@/lib/persistence/webMediaRefs";
import { planAssetsPersist, reviveAssetRecords } from "@/lib/persistence/webMediaRefs";
import {
  clearWebMediaStore,
  deleteMediaKeysExcept,
  getKnownPayloadKeys,
  getMediaObjectUrl,
  putMediaPayload,
  webMediaAvailable,
} from "@/lib/persistence/webMediaStore";

export const KEY_PREFIX = "caiq:";

function shouldUseWebMediaStore(): boolean {
  return Platform.OS === "web" && webMediaAvailable();
}

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
        if (name === "assets" && shouldUseWebMediaStore()) {
          const revived = await reviveAssetRecords(
            parsed as unknown as AssetMediaRecord[],
            (key) => getMediaObjectUrl(key).catch(() => null),
          );
          return { data: revived as unknown as T[] };
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

      let assetsOverride: string | null = null;
      let assetsValidKeys: Set<string> | null = null;
      if (tables.includes("assets") && shouldUseWebMediaStore()) {
        const plan = planAssetsPersist(
          db.assets as unknown as AssetMediaRecord[],
          getKnownPayloadKeys(),
        );
        // Payloads first: if any payload write fails, this save rejects and
        // no record ever references a blob that isn't durably stored.
        for (const payload of plan.payloads) {
          await putMediaPayload(payload.key, payload.uri);
        }
        assetsOverride = JSON.stringify(plan.records);
        assetsValidKeys = plan.validKeys;
      }

      const pairs: [string, string][] = tables.map((t) => [
        `${KEY_PREFIX}${t}`,
        t === "assets" && assetsOverride !== null ? assetsOverride : JSON.stringify(db[t]),
      ]);
      await storage.multiSet(pairs);

      // Records are durable — now drop payloads nothing references anymore.
      if (assetsValidKeys) await deleteMediaKeysExcept(assetsValidKeys);
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
      if (shouldUseWebMediaStore()) await clearWebMediaStore();
    },
  };
}

export const defaultDriver: StorageDriver = createAsyncStorageDriver();
