# Persistence adapter

Local-first storage is accessed through a `StorageDriver` interface
(`driver.ts`). The app store and UI never talk to AsyncStorage directly.

## Wave 1 (current)

- **Driver:** `asyncStorageDriver.ts` — one JSON array per table under `caiq:*`.
- **Facade:** `lib/store.ts` — `loadDb` / `saveDb` / settings / clear.
- **Retry:** failed writes retry twice with 100ms / 500ms backoff.
- **Dirty tables:** `saveDb(db, tables?)` can persist only changed tables;
  retries always re-write the full dirty set (partial `multiSet` safe).
- **Outbox:** compacted by `(table, recordId)` in `outbox.ts` (no hard cap).

## Wave 2 — SQLite migration plan (not implemented)

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
