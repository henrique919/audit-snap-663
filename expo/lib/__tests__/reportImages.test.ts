import { resolveReportImages } from "@/lib/reportImages";

const mockFileToDataUri = jest.fn();

jest.mock("@/lib/files", () => ({
  fileToDataUri: (...args: unknown[]) => mockFileToDataUri(...args),
}));

describe("resolveReportImages", () => {
  beforeEach(() => {
    mockFileToDataUri.mockReset();
  });

  it("honours concurrency ≤3 (instrumented active-worker counter)", async () => {
    let active = 0;
    let peak = 0;
    mockFileToDataUri.mockImplementation(async (uri: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return `data:image/jpeg;base64,${uri}`;
    });

    const uris = Array.from({ length: 12 }, (_, i) => `file:///photo-${i}.jpg`);
    const map = await resolveReportImages(uris, { concurrency: 3 });

    expect(peak).toBeLessThanOrEqual(3);
    expect(map.size).toBe(12);
  });

  it("fires progress callback once per URI (total times)", async () => {
    mockFileToDataUri.mockImplementation(async (uri: string) => `data:${uri}`);
    const progress: [number, number][] = [];
    const uris = ["a", "b", "c", "d", "e"];

    await resolveReportImages(uris, {
      concurrency: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(progress).toHaveLength(5);
    expect(progress.map(([d]) => d)).toEqual([1, 2, 3, 4, 5]);
    expect(progress.every(([, t]) => t === 5)).toBe(true);
  });

  it("omits missing files without aborting", async () => {
    mockFileToDataUri.mockImplementation(async (uri: string) => {
      if (uri.includes("missing")) return null;
      return `data:${uri}`;
    });

    const map = await resolveReportImages(["ok.jpg", "missing.jpg", "also-ok.jpg"]);
    expect(map.size).toBe(2);
    expect(map.has("ok.jpg")).toBe(true);
    expect(map.has("also-ok.jpg")).toBe(true);
    expect(map.has("missing.jpg")).toBe(false);
  });

  it("dedupes URIs and handles empty input", async () => {
    mockFileToDataUri.mockResolvedValue("data:x");
    const map = await resolveReportImages(["a", "a", "b"]);
    expect(mockFileToDataUri).toHaveBeenCalledTimes(2);
    expect(map.size).toBe(2);

    const emptyProgress: [number, number][] = [];
    const empty = await resolveReportImages([], {
      onProgress: (d, t) => emptyProgress.push([d, t]),
    });
    expect(empty.size).toBe(0);
    expect(emptyProgress).toEqual([[0, 0]]);
  });
});
