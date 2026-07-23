/**
 * Web persistence driver.
 *
 * Records and media live in IndexedDB, not AsyncStorage/localStorage. Media
 * fields are replaced at rest with stable `caiq-media:` references and
 * materialised as object URLs when read. This keeps large photo payloads out
 * of the browser's small localStorage quota and makes `blob:` transform output
 * durable across a full browser restart.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { KEY_PREFIX } from "@/lib/persistence/asyncStorageDriver";
import type { StorageDriver, TableLoadResult, TableName } from "@/lib/persistence/driver";
import type { Db } from "@/lib/store";
import type { AppSettings } from "@/types/models";
import { DEFAULT_SETTINGS } from "@/types/models";

const DB_NAME = "punchthis-local";
const DB_VERSION = 1;
const RECORD_STORE = "records";
const MEDIA_STORE = "media";
const MEDIA_SCHEME = "caiq-media:";

type PersistedRecord = Record<string, unknown>;
type PersistedValue = PersistedRecord[] | AppSettings;

interface PreparedValue<T extends PersistedValue> {
  value: T;
  media: Map<string, Blob>;
  activeMediaKeys: Set<string>;
}

const objectUrlCache = new Map<string, string>();
const objectUrlInFlight = new Map<string, Promise<string | null>>();
let databasePromise: Promise<IDBDatabase> | null = null;
let persistRequested = false;

async function resetRuntimeCaches(): Promise<void> {
  if (databasePromise) {
    const database = await databasePromise;
    database.close();
  }
  databasePromise = null;
  persistRequested = false;
  for (const url of objectUrlCache.values()) URL.revokeObjectURL(url);
  objectUrlCache.clear();
  objectUrlInFlight.clear();
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(RECORD_STORE)) {
          database.createObjectStore(RECORD_STORE);
        }
        if (!database.objectStoreNames.contains(MEDIA_STORE)) {
          database.createObjectStore(MEDIA_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open PunchThis browser storage"));
      request.onblocked = () => reject(new Error("PunchThis browser storage upgrade is blocked by another tab"));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  const database = await databasePromise;
  if (!persistRequested) {
    persistRequested = true;
    try {
      await navigator.storage?.persist?.();
    } catch {
      // Persistence is a best-effort browser capability. IndexedDB still
      // remains substantially safer and larger than localStorage without it.
    }
  }
  return database;
}

function mediaKey(scope: string, id: string, field: string): string {
  return `${MEDIA_SCHEME}${scope}/${encodeURIComponent(id)}/${field}`;
}

function isDurableMediaRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(MEDIA_SCHEME);
}

function shouldExternalize(value: unknown): value is string {
  return typeof value === "string" && (/^data:/i.test(value) || /^blob:/i.test(value));
}

function cloudRefField(field: string): string {
  return field.replace(/Uri$/, "CloudRef");
}

function shouldExternalizeField(record: PersistedRecord, field: string, value: unknown): value is string {
  if (shouldExternalize(value)) return true;
  const cloudRef = record[cloudRefField(field)];
  return (
    typeof value === "string" &&
    /^https?:/i.test(value) &&
    typeof cloudRef === "string" &&
    cloudRef.startsWith("supabase://")
  );
}

function mediaFields(scope: TableName | "settings"): readonly string[] {
  switch (scope) {
    case "projects":
      return ["coverPhotoUri", "logoUri"];
    case "assets":
      return ["reportUri", "originalUri", "thumbUri", "annotatedUri"];
    case "reports":
      return ["pdfUri"];
    case "settings":
      return ["logoUri"];
    default:
      return [];
  }
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Could not read browser media (${response.status})`);
  return response.blob();
}

async function prepareRecord(
  scope: TableName | "settings",
  record: PersistedRecord,
  fallbackId: string,
  media: Map<string, Blob>,
  activeMediaKeys: Set<string>,
): Promise<PersistedRecord> {
  const next = { ...record };
  const id = typeof record.id === "string" && record.id ? record.id : fallbackId;
  const duplicateRefs = new Map<string, string>();

  for (const field of mediaFields(scope)) {
    const value = next[field];
    if (isDurableMediaRef(value)) {
      activeMediaKeys.add(value);
      continue;
    }
    if (!shouldExternalizeField(record, field, value)) continue;

    const duplicate = duplicateRefs.get(value);
    if (duplicate) {
      next[field] = duplicate;
      activeMediaKeys.add(duplicate);
      continue;
    }

    const key = mediaKey(scope, id, field);
    media.set(key, await uriToBlob(value));
    activeMediaKeys.add(key);
    duplicateRefs.set(value, key);
    next[field] = key;
  }

  return next;
}

async function prepareTable(name: TableName, rows: unknown[]): Promise<PreparedValue<PersistedRecord[]>> {
  const media = new Map<string, Blob>();
  const activeMediaKeys = new Set<string>();
  const value = await Promise.all(
    rows.map((row, index) =>
      prepareRecord(
        name,
        (row && typeof row === "object" ? row : {}) as PersistedRecord,
        String(index),
        media,
        activeMediaKeys,
      ),
    ),
  );
  return { value, media, activeMediaKeys };
}

async function prepareSettings(settings: AppSettings): Promise<PreparedValue<AppSettings>> {
  const media = new Map<string, Blob>();
  const activeMediaKeys = new Set<string>();
  const value = (await prepareRecord(
    "settings",
    settings as unknown as PersistedRecord,
    "account",
    media,
    activeMediaKeys,
  )) as unknown as AppSettings;
  return { value, media, activeMediaKeys };
}

async function objectUrlFor(database: IDBDatabase, key: string): Promise<string | null> {
  const cached = objectUrlCache.get(key);
  if (cached) return cached;

  const existing = objectUrlInFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const transaction = database.transaction(MEDIA_STORE, "readonly");
    const completed = transactionComplete(transaction);
    const blob = await requestResult(
      transaction.objectStore(MEDIA_STORE).get(key) as IDBRequest<Blob | undefined>,
    );
    await completed;
    if (!blob) return null;

    const url = URL.createObjectURL(blob);
    objectUrlCache.set(key, url);
    return url;
  })().finally(() => objectUrlInFlight.delete(key));
  objectUrlInFlight.set(key, promise);
  return promise;
}

async function materializeRecord(
  database: IDBDatabase,
  scope: TableName | "settings",
  record: PersistedRecord,
): Promise<{ value: PersistedRecord; missing: boolean }> {
  const next = { ...record };
  let missing = false;
  await Promise.all(
    mediaFields(scope).map(async (field) => {
      const value = next[field];
      if (!isDurableMediaRef(value)) return;
      const url = await objectUrlFor(database, value);
      if (url) next[field] = url;
      else missing = true;
    }),
  );
  return { value: next, missing };
}

async function materializeTable(
  database: IDBDatabase,
  name: TableName,
  rows: PersistedRecord[],
): Promise<{ rows: PersistedRecord[]; missing: boolean }> {
  const materialized = await Promise.all(rows.map((row) => materializeRecord(database, name, row)));
  return {
    rows: materialized.map((entry) => entry.value),
    missing: materialized.some((entry) => entry.missing),
  };
}

async function writePrepared(
  database: IDBDatabase,
  recordEntries: [string, PreparedValue<PersistedValue>][],
): Promise<void> {
  const transaction = database.transaction([RECORD_STORE, MEDIA_STORE], "readwrite");
  const records = transaction.objectStore(RECORD_STORE);
  const media = transaction.objectStore(MEDIA_STORE);

  for (const [key, prepared] of recordEntries) {
    records.put(prepared.value, key);
    for (const [mediaKeyValue, blob] of prepared.media) {
      media.put(blob, mediaKeyValue);
    }
  }
  await transactionComplete(transaction);

  // Stable media keys overwrite in place. Clean up only the scopes written in
  // this transaction so deleted issues/photos do not leak browser storage.
  for (const [scope, prepared] of recordEntries) {
    const prefix = `${MEDIA_SCHEME}${scope}/`;
    const cleanup = database.transaction(MEDIA_STORE, "readwrite");
    const completed = transactionComplete(cleanup);
    const store = cleanup.objectStore(MEDIA_STORE);
    const keys = await requestResult(store.getAllKeys());
    for (const key of keys) {
      if (
        typeof key === "string" &&
        key.startsWith(prefix) &&
        !prepared.activeMediaKeys.has(key)
      ) {
        store.delete(key);
        const cached = objectUrlCache.get(key);
        if (cached) {
          URL.revokeObjectURL(cached);
          objectUrlCache.delete(key);
        }
      }
    }
    await completed;
  }
}

async function loadLegacyTable<T>(name: TableName): Promise<TableLoadResult<T>> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${name}`);
    if (!raw) return { data: [] };
    const parsed = JSON.parse(raw) as T[];
    if (!Array.isArray(parsed)) {
      return { data: [], warning: `Table "${name}" was not a JSON array and was reset.` };
    }
    return { data: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { data: [], warning: `Table "${name}" could not be read (${message}) and was reset.` };
  }
}

export function createIndexedDbStorageDriver(): StorageDriver {
  return {
    async loadTable<T>(name: TableName): Promise<TableLoadResult<T>> {
      const database = await openDatabase();
      const transaction = database.transaction(RECORD_STORE, "readonly");
      const completed = transactionComplete(transaction);
      const stored = await requestResult(
        transaction.objectStore(RECORD_STORE).get(name) as IDBRequest<PersistedRecord[] | undefined>,
      );
      await completed;

      if (!stored) {
        const legacy = await loadLegacyTable<T>(name);
        if (legacy.data.length > 0) {
          const prepared = await prepareTable(name, legacy.data);
          await writePrepared(database, [[name, prepared]]);
          await AsyncStorage.removeItem(`${KEY_PREFIX}${name}`);
          const materialized = await materializeTable(database, name, prepared.value);
          return {
            data: materialized.rows as T[],
            warning:
              legacy.warning ??
              (materialized.missing ? `Some media in "${name}" could not be restored.` : undefined),
          };
        }
        return legacy;
      }

      const materialized = await materializeTable(database, name, stored);
      return {
        data: materialized.rows as T[],
        warning: materialized.missing ? `Some media in "${name}" could not be restored.` : undefined,
      };
    },

    async saveTables(db: Db, tables: TableName[]): Promise<void> {
      if (tables.length === 0) return;
      const database = await openDatabase();
      const prepared = await Promise.all(
        tables.map(async (name) => [name, await prepareTable(name, db[name])] as const),
      );
      await writePrepared(database, prepared as [string, PreparedValue<PersistedValue>][]);
    },

    async loadSettings(): Promise<AppSettings> {
      const database = await openDatabase();
      const transaction = database.transaction(RECORD_STORE, "readonly");
      const completed = transactionComplete(transaction);
      const stored = await requestResult(
        transaction.objectStore(RECORD_STORE).get("settings") as IDBRequest<AppSettings | undefined>,
      );
      await completed;

      if (!stored) {
        const raw = await AsyncStorage.getItem(`${KEY_PREFIX}settings`);
        const settings = raw
          ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
          : { ...DEFAULT_SETTINGS };
        const prepared = await prepareSettings(settings);
        await writePrepared(database, [["settings", prepared]]);
        if (raw) await AsyncStorage.removeItem(`${KEY_PREFIX}settings`);
        const materialized = await materializeRecord(
          database,
          "settings",
          prepared.value as unknown as PersistedRecord,
        );
        return materialized.value as unknown as AppSettings;
      }

      const materialized = await materializeRecord(
        database,
        "settings",
        stored as unknown as PersistedRecord,
      );
      return { ...DEFAULT_SETTINGS, ...(materialized.value as unknown as Partial<AppSettings>) };
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      const database = await openDatabase();
      const prepared = await prepareSettings(settings);
      await writePrepared(database, [["settings", prepared]]);
    },

    async clearAll(): Promise<void> {
      const database = await openDatabase();
      const transaction = database.transaction([RECORD_STORE, MEDIA_STORE], "readwrite");
      transaction.objectStore(RECORD_STORE).clear();
      transaction.objectStore(MEDIA_STORE).clear();
      await transactionComplete(transaction);

      for (const url of objectUrlCache.values()) URL.revokeObjectURL(url);
      objectUrlCache.clear();
      objectUrlInFlight.clear();

      const keys = await AsyncStorage.getAllKeys();
      const ours = keys.filter((key) => key.startsWith(KEY_PREFIX));
      if (ours.length > 0) await AsyncStorage.multiRemove(ours);
    },
  };
}

export const indexedDbDriverInternals = {
  DB_NAME,
  MEDIA_SCHEME,
  mediaFields,
  mediaKey,
  resetRuntimeCaches,
  shouldExternalize,
  shouldExternalizeField,
};
