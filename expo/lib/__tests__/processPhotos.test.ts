import { processPhotosBounded } from "@/lib/processPhotos";
import type { ProcessedPhoto } from "@/lib/files";

const mockProcessPickedPhoto = jest.fn();
let mockIdCounter = 0;

jest.mock("@/lib/files", () => ({
  processPickedPhoto: (...args: unknown[]) => mockProcessPickedPhoto(...args),
}));

jest.mock("@/lib/ids", () => ({
  newId: () => `id-${mockIdCounter++}`,
}));

function photo(uri: string): ProcessedPhoto {
  return { originalUri: uri, reportUri: uri, thumbUri: uri, width: 100, height: 100 };
}

describe("processPhotosBounded", () => {
  beforeEach(() => {
    mockProcessPickedPhoto.mockReset();
    mockIdCounter = 0;
  });

  it("honours concurrency ≤2 (instrumented active-worker counter)", async () => {
    let active = 0;
    let peak = 0;
    mockProcessPickedPhoto.mockImplementation(async (uri: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return photo(uri);
    });

    const uris = Array.from({ length: 6 }, (_, i) => `file:///photo-${i}.jpg`);
    const results = await processPhotosBounded(uris, { concurrency: 2 });

    expect(peak).toBeLessThanOrEqual(2);
    expect(results).toHaveLength(6);
  });

  it("caps concurrency at 2 even if a higher value is requested", async () => {
    let active = 0;
    let peak = 0;
    mockProcessPickedPhoto.mockImplementation(async (uri: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      return photo(uri);
    });

    const uris = Array.from({ length: 6 }, (_, i) => `file:///photo-${i}.jpg`);
    await processPhotosBounded(uris, { concurrency: 5 });

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("preserves input order in the output regardless of completion order", async () => {
    // Odd-indexed items resolve slower than even-indexed ones.
    mockProcessPickedPhoto.mockImplementation(async (uri: string, id: string) => {
      const index = Number(uri.split("-")[1]);
      await new Promise((r) => setTimeout(r, index % 2 === 0 ? 5 : 25));
      return photo(`${uri}::${id}`);
    });

    const uris = Array.from({ length: 5 }, (_, i) => `photo-${i}`);
    const results = await processPhotosBounded(uris, { concurrency: 2 });

    expect(results.map((p) => p.originalUri.split("::")[0])).toEqual(uris);
  });

  it("fires progress callback once per photo (total times)", async () => {
    mockProcessPickedPhoto.mockImplementation(async (uri: string) => photo(uri));
    const progress: Array<[number, number]> = [];
    const uris = ["a", "b", "c", "d"];

    await processPhotosBounded(uris, {
      concurrency: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(progress).toHaveLength(4);
    expect(progress.map(([d]) => d)).toEqual([1, 2, 3, 4]);
    expect(progress.every(([, t]) => t === 4)).toBe(true);
  });

  it("handles empty input without calling the processor", async () => {
    const emptyProgress: Array<[number, number]> = [];
    const results = await processPhotosBounded([], {
      onProgress: (d, t) => emptyProgress.push([d, t]),
    });

    expect(results).toEqual([]);
    expect(mockProcessPickedPhoto).not.toHaveBeenCalled();
    expect(emptyProgress).toEqual([[0, 0]]);
  });

  it("rejects the whole batch if a single photo fails to process", async () => {
    mockProcessPickedPhoto.mockImplementation(async (uri: string) => {
      if (uri === "bad") throw new Error("decode failed");
      return photo(uri);
    });

    await expect(processPhotosBounded(["ok", "bad", "ok2"], { concurrency: 2 })).rejects.toThrow(
      "decode failed",
    );
  });
});
