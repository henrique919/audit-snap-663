/**
 * IndexedDB payload store for web photo media.
 *
 * localStorage (AsyncStorage's web backend) has a ~5MB per-origin cap — a
 * handful of photos. IndexedDB quotas are orders of magnitude larger, so on
 * web the persisted `assets` table holds `idbmedia:` refs (webMediaRefs.ts)
 * and the pixels live here as Blobs.
 *
 * Session cache: `knownPayloadKeys` maps URI strings (data URIs from fresh
 * captures, object URLs minted at load) to the IDB key that already holds
 * their payload, so repeated table saves don't re-write identical blobs.
 */

import { parseMediaRef } from "@/lib/persistence/webMediaRefs";

const DB_NAME = "caiq-media";
const STORE = "media";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function webMediaAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null; // allow a retry on the next call
        reject(req.error ?? new Error("IndexedDB open failed"));
      };
    });
  }
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/** URI string → IDB key already holding that payload (this session). */
const knownPayloadKeys = new Map<string, string>();

export function getKnownPayloadKeys(): ReadonlyMap<string, string> {
  return knownPayloadKeys;
}

/** Write one payload URI's bytes under `key`. Rejects on quota/availability failures. */
export async function putMediaPayload(key: string, uri: string): Promise<void> {
  if (knownPayloadKeys.get(uri) === key) return;
  const blob = await (await fetch(uri)).blob();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
  });
  knownPayloadKeys.set(uri, key);
}

/**
 * Resolve an IDB key to a fresh object URL for this session, or null when the
 * payload is missing. The minted URL is registered in the session cache so a
 * later save aliases it instead of re-writing the blob.
 */
export async function getMediaObjectUrl(key: string): Promise<string | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const blob = await requestToPromise<Blob | undefined>(tx.objectStore(STORE).get(key));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  knownPayloadKeys.set(url, key);
  return url;
}

/**
 * Best-effort orphan sweep: delete every stored key not in `validKeys`.
 * Runs after a successful records write; failures are logged, never thrown —
 * an orphaned blob is waste, not data loss.
 */
export async function deleteMediaKeysExcept(validKeys: ReadonlySet<string>): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const keys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());
    for (const key of keys) {
      if (typeof key === "string" && !validKeys.has(key)) store.delete(key);
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (e) {
    console.log("[webMedia] orphan sweep failed", e);
  }
}

/** Wipe the whole media store (Clear-all-data path). */
export async function clearWebMediaStore(): Promise<void> {
  if (!webMediaAvailable()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB clear failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB clear aborted"));
  });
  knownPayloadKeys.clear();
}

/** Revive resolver for webMediaRefs.reviveAssetRecords. */
export async function resolveMediaRefUri(refOrKey: string): Promise<string | null> {
  const key = parseMediaRef(refOrKey) ?? refOrKey;
  try {
    return await getMediaObjectUrl(key);
  } catch (e) {
    console.log("[webMedia] resolve failed for", key, e);
    return null;
  }
}
