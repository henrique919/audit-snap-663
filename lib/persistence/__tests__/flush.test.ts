/**
 * Models AppStore debounce + AppState background flush against a mock driver.
 */

import { KEY_PREFIX } from "@/lib/persistence/asyncStorageDriver";
import type { StorageDriver, TableName } from "@/lib/persistence/driver";
import { EMPTY_DB, saveDb, setStorageDriver, type Db } from "@/lib/store";
import { DEFAULT_SETTINGS } from "@/types/models";

function mockDriver() {
  const writes: { tables: TableName[]; at: number }[] = [];
  const driver: StorageDriver & { writes: typeof writes } = {
    writes,
    async loadTable() {
      return { data: [] };
    },
    async saveTables(_db: Db, tables: TableName[]) {
      writes.push({ tables: [...tables], at: Date.now() });
    },
    async loadSettings() {
      return { ...DEFAULT_SETTINGS };
    },
    async saveSettings() {},
    async clearAll() {},
  };
  return driver;
}

describe("background flush of pending debounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("flushes pending debounce on background before the 250ms timer fires", async () => {
    const driver = mockDriver();
    setStorageDriver(driver);

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: Db | null = null;
    const dirty = new Set<TableName>();

    const flushPersist = async () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (!pending && dirty.size === 0) return;
      const snapshot = pending ?? EMPTY_DB;
      const tables = dirty.size > 0 ? Array.from(dirty) : (["projects"] as TableName[]);
      pending = null;
      dirty.clear();
      await saveDb(snapshot, tables);
    };

    const schedulePersist = (next: Db, tables: TableName[]) => {
      pending = next;
      for (const t of tables) dirty.add(t);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void flushPersist();
      }, 250);
    };

    const next = { ...EMPTY_DB, projects: [] };
    schedulePersist(next, ["projects"]);

    // AppState → background/inactive before debounce elapses
    await flushPersist();

    expect(driver.writes.length).toBe(1);
    expect(driver.writes[0]?.tables).toContain("projects");
    expect(driver.writes[0]?.tables.every((t) => !t.includes(KEY_PREFIX))).toBe(true);

    // Timer must not double-write
    jest.advanceTimersByTime(300);
    await Promise.resolve();
    expect(driver.writes.length).toBe(1);
  });
});
