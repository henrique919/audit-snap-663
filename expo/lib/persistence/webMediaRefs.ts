/**
 * Pure planning/parsing helpers for the web media store (IndexedDB).
 *
 * On web, photo payloads (data URIs) do not belong in the AsyncStorage/
 * localStorage JSON tables: the per-origin localStorage quota (~5MB) fits
 * only a handful of photos, and when it fills, writes fail. Instead the
 * persisted `assets` table stores small `idbmedia:<key>` references and the
 * pixel payloads live in IndexedDB (see webMediaStore.ts).
 *
 * Everything in this module is pure string/array logic so it can be unit
 * tested without a DOM or IndexedDB.
 */

export const MEDIA_REF_PREFIX = "idbmedia:";

export type MediaVariant = "original" | "report" | "thumb" | "annotated";

/** Order matters: report is planned before original so original can alias it. */
export const MEDIA_VARIANTS: MediaVariant[] = ["report", "thumb", "annotated", "original"];

const VARIANT_FIELD: Record<MediaVariant, "originalUri" | "reportUri" | "thumbUri" | "annotatedUri"> = {
  original: "originalUri",
  report: "reportUri",
  thumb: "thumbUri",
  annotated: "annotatedUri",
};

export interface AssetMediaRecord {
  id: string;
  originalUri: string;
  reportUri: string;
  thumbUri: string;
  annotatedUri: string | null;
}

export function mediaKey(assetId: string, variant: MediaVariant): string {
  return `${assetId}:${variant}`;
}

export function mediaRef(key: string): string {
  return MEDIA_REF_PREFIX + key;
}

/** Returns the IDB key a ref points at, or null when the value is not a ref. */
export function parseMediaRef(value: string | null | undefined): string | null {
  if (!value || !value.startsWith(MEDIA_REF_PREFIX)) return null;
  const key = value.slice(MEDIA_REF_PREFIX.length);
  return key.length > 0 ? key : null;
}

/** True for URI schemes whose payload must move to IndexedDB before persisting. */
export function isInlinePayload(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("data:") || value.startsWith("blob:");
}

export interface PlannedPayload {
  key: string;
  uri: string;
}

export interface AssetPersistPlan<T extends AssetMediaRecord> {
  /** Records with payload fields replaced by refs — this is what gets serialized. */
  records: T[];
  /** Payloads that must be written to IndexedDB before the records are persisted. */
  payloads: PlannedPayload[];
  /** Every IDB key referenced by the planned records — the keep-set for orphan reconciliation. */
  validKeys: Set<string>;
}

/**
 * Plan the persisted form of the assets table.
 *
 * - Inline payloads (data:/blob:) are assigned an IDB key and replaced by refs.
 * - `knownPayloadKeys` maps a URI string to a key already stored in IndexedDB
 *   this session; matching URIs are aliased to the existing key with no new
 *   write (this also makes duplicated issues share one payload, mirroring the
 *   native pipeline's shared files).
 * - `originalUri === reportUri` (the documented web tradeoff) is stored once.
 * - Values that are already refs pass through untouched.
 */
export function planAssetsPersist<T extends AssetMediaRecord>(
  assets: readonly T[],
  knownPayloadKeys: ReadonlyMap<string, string>,
): AssetPersistPlan<T> {
  const payloads: PlannedPayload[] = [];
  const plannedKeyByUri = new Map<string, string>();
  const validKeys = new Set<string>();

  const keyFor = (uri: string, fallbackKey: string): { key: string; needsWrite: boolean } => {
    const known = knownPayloadKeys.get(uri) ?? plannedKeyByUri.get(uri);
    if (known) return { key: known, needsWrite: false };
    plannedKeyByUri.set(uri, fallbackKey);
    return { key: fallbackKey, needsWrite: true };
  };

  const records = assets.map((asset) => {
    const next: T = { ...asset };
    for (const variant of MEDIA_VARIANTS) {
      const field = VARIANT_FIELD[variant];
      const value = asset[field];
      if (value == null) continue;

      const existingRef = parseMediaRef(value);
      if (existingRef) {
        validKeys.add(existingRef);
        continue;
      }
      if (!isInlinePayload(value)) continue;

      const { key, needsWrite } = keyFor(value, mediaKey(asset.id, variant));
      if (needsWrite) payloads.push({ key, uri: value });
      validKeys.add(key);
      (next as AssetMediaRecord)[field] = mediaRef(key);
    }
    return next;
  });

  return { records, payloads, validKeys };
}

export interface ReviveResolver {
  /** Resolve an IDB key to a usable same-session URI (object URL), or null when missing. */
  (key: string): Promise<string | null>;
}

/**
 * Resolve persisted refs back to renderable URIs. Missing payloads resolve to
 * an empty string (renders as a blank image slot) rather than a dead ref —
 * the record survives even if its pixels were lost.
 */
export async function reviveAssetRecords<T extends AssetMediaRecord>(
  records: readonly T[],
  resolve: ReviveResolver,
): Promise<T[]> {
  const cache = new Map<string, string | null>();
  const lookup = async (key: string): Promise<string | null> => {
    if (cache.has(key)) return cache.get(key) ?? null;
    const uri = await resolve(key);
    cache.set(key, uri);
    return uri;
  };

  const out: T[] = [];
  for (const record of records) {
    const next: T = { ...record };
    for (const variant of MEDIA_VARIANTS) {
      const field = VARIANT_FIELD[variant];
      const value = record[field];
      const key = parseMediaRef(value ?? null);
      if (!key) continue;
      const uri = await lookup(key);
      if (uri == null) {
        console.log(`[webMedia] missing payload for ${key} — record kept, image blank`);
      }
      (next as AssetMediaRecord)[field] = uri ?? "";
    }
    out.push(next);
  }
  return out;
}
