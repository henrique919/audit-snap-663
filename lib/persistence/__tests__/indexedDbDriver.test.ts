import "fake-indexeddb/auto";

import { createIndexedDbStorageDriver, indexedDbDriverInternals } from "@/lib/persistence/indexedDbDriver";
import { EMPTY_DB, type Db } from "@/lib/store";
import type { PhotoAsset } from "@/types/models";

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database deletion was blocked"));
  });
}

function mediaCount(): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(indexedDbDriverInternals.DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("media", "readonly");
      const count = transaction.objectStore("media").count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
      transaction.oncomplete = () => database.close();
    };
  });
}

describe("IndexedDB web persistence", () => {
  const originalFetch = global.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeAll(() => {
    let nextObjectUrl = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => `blob:punchthis-test-${++nextObjectUrl}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
    global.fetch = jest.fn(async (uri: string | URL | Request) =>
      ({
        ok: true,
        status: 200,
        blob: async () => new Blob([String(uri)], { type: "image/jpeg" }),
      }) as Response,
    ) as unknown as jest.MockedFunction<typeof fetch>;
  });

  afterAll(async () => {
    await indexedDbDriverInternals.resetRuntimeCaches();
    await deleteDatabase(indexedDbDriverInternals.DB_NAME);
    global.fetch = originalFetch;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  it("caches temporary private signed URLs only when a stable cloud reference exists", () => {
    expect(
      indexedDbDriverInternals.shouldExternalizeField(
        {
          reportUri: "https://example.supabase.co/storage/v1/object/sign/project-media/file.jpg?token=short",
          reportCloudRef: "supabase://project-media/user/project/file.jpg",
        },
        "reportUri",
        "https://example.supabase.co/storage/v1/object/sign/project-media/file.jpg?token=short",
      ),
    ).toBe(true);
    expect(
      indexedDbDriverInternals.shouldExternalizeField(
        { reportUri: "https://cdn.example.com/static.jpg" },
        "reportUri",
        "https://cdn.example.com/static.jpg",
      ),
    ).toBe(false);
  });

  it("stores 50 photo issues and restores every media variant after restart", async () => {
    await indexedDbDriverInternals.resetRuntimeCaches();
    await deleteDatabase(indexedDbDriverInternals.DB_NAME);

    const assets: PhotoAsset[] = Array.from({ length: 50 }, (_, index) => {
      const sharedWorking = `data:image/jpeg;base64,working-${index}`;
      return {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        createdAt: "2026-07-23T00:00:00.000Z",
        updatedAt: "2026-07-23T00:00:00.000Z",
        deletedAt: null,
        syncStatus: "local_only",
        localVersion: 1,
        serverVersion: 1,
        issueId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        auditId: "20000000-0000-4000-8000-000000000000",
        projectId: "30000000-0000-4000-8000-000000000000",
        originalUri: sharedWorking,
        reportUri: sharedWorking,
        thumbUri: `data:image/jpeg;base64,thumb-${index}`,
        annotatedUri: null,
        width: 1800,
        height: 1200,
        capturedAt: "2026-07-23T00:00:00.000Z",
      };
    });
    const database: Db = { ...EMPTY_DB, assets };
    const driver = createIndexedDbStorageDriver();

    await driver.saveTables(database, ["assets"]);
    expect(await mediaCount()).toBe(100);

    // Simulate a browser process restart: close the database connection and
    // discard all session-only object URLs while retaining IndexedDB data.
    await indexedDbDriverInternals.resetRuntimeCaches();
    const restartedDriver = createIndexedDbStorageDriver();
    const restored = await restartedDriver.loadTable<PhotoAsset>("assets");

    expect(restored.warning).toBeUndefined();
    expect(restored.data).toHaveLength(50);
    expect(restored.data.every((asset) => asset.reportUri.startsWith("blob:punchthis-test-"))).toBe(true);
    expect(restored.data.every((asset) => asset.thumbUri.startsWith("blob:punchthis-test-"))).toBe(true);
    expect(restored.data.every((asset) => asset.originalUri === asset.reportUri)).toBe(true);
  });
});
