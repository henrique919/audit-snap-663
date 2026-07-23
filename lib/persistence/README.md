# Persistence adapter

Local-first storage is accessed through a `StorageDriver` interface
(`driver.ts`). The app store and UI never talk to AsyncStorage directly.

## Current drivers

- **Native:** `asyncStorageDriver.ts` — one JSON array per table under `caiq:*`.
- **Web:** `indexedDbDriver.ts` — records and media in IndexedDB. Data/blob
  media is stored as `Blob` values and materialised to session object URLs on
  read. Existing `caiq:*` localStorage data migrates automatically on first
  read, then the migrated legacy key is removed to release quota.
- **Facade:** `lib/store.ts` — `loadDb` / `saveDb` / settings / clear.
- **Retry:** failed writes retry twice with 100ms / 500ms backoff.
- **Dirty tables:** `saveDb(db, tables?)` persists only changed tables.
  IndexedDB commits all dirty record tables and their media blobs in one
  transaction; retries always re-write the full dirty set.
- **Outbox:** compacted by `(table, recordId)` in `outbox.ts` (no hard cap).

## Native SQLite migration plan (not implemented)

1. Add a `SqliteStorageDriver` implementing the same `StorageDriver` interface
   (expo-sqlite or similar), mapping each `keyof Db` to a table or a
   single-row JSON blob column initially.
2. On first launch after upgrade, read all `caiq:*` AsyncStorage keys via the
   old driver, write into SQLite inside a transaction, then keep AsyncStorage
   as a read-only fallback for one release (or delete after verified migrate).
3. Swap the default driver in `store.ts` (`setStorageDriver` / module default).
   No AppStore API changes — only the driver module changes.
4. Optionally move from whole-table JSON blobs to row-level SQL once sync
   lands; outbox compaction already keys by record id for that path.
5. Keep the `caiq:` key prefix semantics for any remaining settings/meta keys
   until settings also move into SQLite.

Do **not** change the exported `Db` shape, `TABLE_NAMES`, or `loadDb` name
while migrating — other tracks import them as types.
