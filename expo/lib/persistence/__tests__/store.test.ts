import { KEY_PREFIX } from "@/lib/persistence/asyncStorageDriver";
import type { StorageDriver, TableName } from "@/lib/persistence/driver";
import {
  EMPTY_DB,
  loadDbDetailed,
  saveDb,
  setStorageDriver,
  TABLE_NAMES,
  type Db,
} from "@/lib/store";
import { DEFAULT_SETTINGS } from "@/types/models";

function memoryDriver(initial: Record<string, string> = {}): StorageDriver & {
  store: Map<string, string>;
  saveCalls: { tables: TableName[] }[];
  failNextSaves: number;
} {
  const store = new Map<string, string>(Object.entries(initial));
  const saveCalls: { tables: TableName[] }[] = [];
  const driver: StorageDriver & {
    store: Map<string, string>;
    saveCalls: { tables: TableName[] }[];
    failNextSaves: number;
  } = {
    store,
    saveCalls,
    failNextSaves: 0,
    async loadTable<T>(name: TableName) {
      const raw = store.get(`${KEY_PREFIX}${name}`);
      if (!raw) return { data: [] as T[] };
      try {
        const parsed = JSON.parse(raw) as T[];
        if (!Array.isArray(parsed)) {
          return { data: [] as T[], warning: `bad ${name}` };
        }
        return { data: parsed };
      } catch {
        return { data: [] as T[], warning: `corrupt ${name}` };
      }
    },
    async saveTables(db: Db, tables: TableName[]) {
      if (driver.failNextSaves > 0) {
        driver.failNextSaves -= 1;
        throw new Error("AsyncStorage multiSet failed");
      }
      saveCalls.push({ tables: [...tables] });
      for (const t of tables) {
        store.set(`${KEY_PREFIX}${t}`, JSON.stringify(db[t]));
      }
    },
    async loadSettings() {
      return { ...DEFAULT_SETTINGS };
    },
    async saveSettings() {},
    async clearAll() {
      store.clear();
    },
  };
  return driver;
}

describe("store facade + driver", () => {
  it("keeps caiq: key prefix unchanged", () => {
    expect(KEY_PREFIX).toBe("caiq:");
  });

  it("loads old JSON shape fixtures correctly", async () => {
    const fixtureProject = {
      id: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      syncStatus: "local_only",
      localVersion: 1,
      serverVersion: 1,
      name: "Legacy Project",
      reference: "LEG-1",
      clientName: "Client",
      siteAddress: "1 Street",
      companyName: "",
      inspectorName: "Alex",
      coverPhotoUri: null,
      logoUri: null,
      status: "active",
    };
    const legacyOutbox = Array.from({ length: 220 }, (_, i) => ({
      id: `o${i}`,
      table: "projects",
      recordId: "p1",
      op: i === 0 ? "create" : "update",
      at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
    }));

    const driver = memoryDriver({
      [`${KEY_PREFIX}projects`]: JSON.stringify([fixtureProject]),
      [`${KEY_PREFIX}outbox`]: JSON.stringify(legacyOutbox),
    });
    setStorageDriver(driver);

    const { db, warnings } = await loadDbDetailed();
    expect(warnings).toEqual([]);
    expect(db.projects).toHaveLength(1);
    expect(db.projects[0]?.name).toBe("Legacy Project");
    expect(db.outbox.length).toBeLessThanOrEqual(1);
    expect(db.outbox[0]?.op).toBe("create");
  });

  it("surfaces hydration warning on corrupt JSON but returns []", async () => {
    const driver = memoryDriver({
      [`${KEY_PREFIX}issues`]: "{not-json",
    });
    setStorageDriver(driver);
    const { db, warnings } = await loadDbDetailed();
    expect(db.issues).toEqual([]);
    expect(warnings.some((w) => w.includes("issues"))).toBe(true);
  });

  it("saveDb returns discriminated failure after retries", async () => {
    const driver = memoryDriver();
    driver.failNextSaves = 100;
    setStorageDriver(driver);
    const result = await saveDb(EMPTY_DB);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/multiSet failed/);
    }
  });

  it("retries re-write all dirty tables after partial failure", async () => {
    const driver = memoryDriver();
    let attempts = 0;
    const original = driver.saveTables.bind(driver);
    driver.saveTables = async (db, tables) => {
      attempts += 1;
      if (attempts === 1) throw new Error("partial multiSet");
      return original(db, tables);
    };
    setStorageDriver(driver);
    const result = await saveDb(EMPTY_DB, ["projects", "outbox"]);
    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(driver.store.has(`${KEY_PREFIX}projects`)).toBe(true);
    expect(driver.store.has(`${KEY_PREFIX}outbox`)).toBe(true);
  });

  it("exports stable TABLE_NAMES", () => {
    expect(TABLE_NAMES).toContain("outbox");
    expect(TABLE_NAMES).toContain("projects");
  });
});
