/**
 * Media registry / GC unit tests — FileSystem is mocked.
 */

import type { Db } from "@/lib/store";
import { EMPTY_DB } from "@/lib/store";
import {
  collectReferencedUris,
  parseEmbeddedTimestampMs,
  runMediaGc,
} from "@/lib/mediaRegistry";
import {
  annotatedCaptureOptions,
  deleteFileQuiet,
  deleteProcessedPhoto,
  isUriReferencedByAssets,
} from "@/lib/files";
import type { PhotoAsset, Project, ReportExport } from "@/types/models";

const mockGetInfoAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  moveAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

function base(id: string) {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null as string | null,
    syncStatus: "local_only" as const,
    localVersion: 1,
    serverVersion: 1,
  };
}

function asset(partial: Partial<PhotoAsset> & Pick<PhotoAsset, "id">): PhotoAsset {
  return {
    ...base(partial.id),
    issueId: "i1",
    auditId: "a1",
    projectId: "p1",
    originalUri: `file:///docs/photos/orig_${partial.id}.jpg`,
    reportUri: `file:///docs/photos/report_${partial.id}.jpg`,
    thumbUri: `file:///docs/photos/thumb_${partial.id}.jpg`,
    annotatedUri: null,
    width: 1800,
    height: 1200,
    capturedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("annotatedCaptureOptions", () => {
  it("requests report-resolution flatten dimensions", () => {
    expect(annotatedCaptureOptions(1800, 1200)).toEqual({
      format: "jpg",
      quality: 0.9,
      result: "tmpfile",
      width: 1800,
      height: 1200,
    });
  });
});

describe("deleteFileQuiet / deleteProcessedPhoto", () => {
  beforeEach(() => {
    mockGetInfoAsync.mockReset();
    mockDeleteAsync.mockReset();
  });

  it("is idempotent for missing files", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    await deleteFileQuiet("file:///docs/photos/gone.jpg");
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("deletes existing processed variants", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: false });
    mockDeleteAsync.mockResolvedValue(undefined);
    await deleteProcessedPhoto({
      originalUri: "file:///docs/photos/orig_a.jpg",
      reportUri: "file:///docs/photos/report_a.jpg",
      thumbUri: "file:///docs/photos/thumb_a.jpg",
      width: 1,
      height: 1,
    });
    expect(mockDeleteAsync).toHaveBeenCalledTimes(3);
  });
});

describe("isUriReferencedByAssets", () => {
  it("protects shared files used by duplicate assets", () => {
    const shared = "file:///docs/photos/report_shared.jpg";
    const a = asset({ id: "a1", reportUri: shared });
    const b = asset({ id: "a2", reportUri: shared });
    expect(isUriReferencedByAssets([a, b], shared)).toBe(true);
    expect(isUriReferencedByAssets([a], "file:///docs/photos/orphan.jpg")).toBe(false);
  });
});

describe("collectReferencedUris", () => {
  it("includes soft-deleted asset URIs and report/project/settings logos", () => {
    const soft = asset({
      id: "soft",
      deletedAt: "2026-02-01T00:00:00.000Z",
      annotatedUri: "file:///docs/photos/ann_soft.jpg",
    });
    const project: Project = {
      ...base("p1"),
      name: "P",
      reference: "",
      clientName: "",
      siteAddress: "",
      companyName: "",
      inspectorName: "",
      coverPhotoUri: "file:///docs/photos/cover.jpg",
      logoUri: "file:///docs/brand/proj.png",
      status: "active",
    };
    const report: ReportExport = {
      ...base("r1"),
      auditId: "a1",
      projectId: "p1",
      pdfUri: "file:///docs/reports/out.pdf",
      issueCount: 1,
      photoCount: 1,
      options: {} as ReportExport["options"],
    };
    const db: Db = {
      ...EMPTY_DB,
      projects: [project],
      assets: [soft],
      reports: [report],
    };
    const refs = collectReferencedUris(db, "file:///docs/brand/settings.png");
    expect(refs.has(soft.originalUri)).toBe(true);
    expect(refs.has(soft.annotatedUri!)).toBe(true);
    expect(refs.has(project.coverPhotoUri!)).toBe(true);
    expect(refs.has(project.logoUri!)).toBe(true);
    expect(refs.has(report.pdfUri)).toBe(true);
    expect(refs.has("file:///docs/brand/settings.png")).toBe(true);
  });
});

describe("parseEmbeddedTimestampMs", () => {
  it("reads Date.now() suffix from filenames", () => {
    expect(parseEmbeddedTimestampMs("report_abc_1710000000000.jpg")).toBe(1710000000000);
    expect(parseEmbeddedTimestampMs("orig_abc.jpg")).toBeNull();
  });
});

describe("runMediaGc", () => {
  const NOW = 1_800_000_000_000;

  beforeEach(() => {
    mockGetInfoAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockReadDirectoryAsync.mockReset();
    mockDeleteAsync.mockResolvedValue(undefined);
  });

  function stubDirs(filesByDir: { photos?: string[]; reports?: string[]; brand?: string[] }) {
    mockReadDirectoryAsync.mockImplementation(async (dir: string) => {
      if (dir.includes("/photos")) return filesByDir.photos ?? [];
      if (dir.includes("/reports")) return filesByDir.reports ?? [];
      if (dir.includes("/brand")) return filesByDir.brand ?? [];
      return [];
    });
  }

  it("never deletes referenced files", async () => {
    const a = asset({ id: "keep" });
    stubDirs({ photos: ["orig_keep.jpg", "report_keep.jpg", "thumb_keep.jpg"], reports: [], brand: [] });
    mockGetInfoAsync.mockImplementation(async (uri: string) => ({
      exists: true,
      isDirectory: false,
      size: 100,
      modificationTime: (NOW - 48 * 3600 * 1000) / 1000,
      uri,
    }));

    const result = await runMediaGc(
      { ...EMPTY_DB, assets: [a] },
      { logoUri: null },
      { nowMs: NOW, minAgeMs: 24 * 3600 * 1000 },
    );
    expect(result.deleted).toBe(0);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("protects shared files used by duplicate assets", async () => {
    const sharedReport = "file:///docs/photos/report_shared_1700000000000.jpg";
    const a1 = asset({ id: "d1", reportUri: sharedReport });
    const a2 = asset({ id: "d2", reportUri: sharedReport });
    stubDirs({
      photos: ["report_shared_1700000000000.jpg", "orphan_1700000000000.jpg"],
      reports: [],
      brand: [],
    });
    mockGetInfoAsync.mockImplementation(async (uri: string) => ({
      exists: true,
      isDirectory: false,
      size: 50,
      modificationTime: (NOW - 48 * 3600 * 1000) / 1000,
      uri,
    }));

    const result = await runMediaGc(
      { ...EMPTY_DB, assets: [a1, a2] },
      { logoUri: null },
      { nowMs: NOW },
    );
    expect(result.deleted).toBe(1);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync.mock.calls[0][0]).toContain("orphan_");
  });

  it("skips young orphans (age gate)", async () => {
    const young = NOW - 60_000; // 1 minute ago
    stubDirs({ photos: [`orphan_${young}.jpg`], reports: [], brand: [] });
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 10,
      modificationTime: young / 1000,
    });

    const result = await runMediaGc(EMPTY_DB, { logoUri: null }, { nowMs: NOW });
    expect(result.deleted).toBe(0);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("deletes old orphans", async () => {
    const old = NOW - 48 * 3600 * 1000;
    stubDirs({ photos: [`orphan_${old}.jpg`], reports: [], brand: [] });
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 42,
      modificationTime: old / 1000,
    });

    const result = await runMediaGc(EMPTY_DB, { logoUri: null }, { nowMs: NOW });
    expect(result.deleted).toBe(1);
    expect(result.freedBytes).toBe(42);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
  });

  it("dryRun deletes nothing", async () => {
    const old = NOW - 48 * 3600 * 1000;
    stubDirs({ photos: [`orphan_${old}.jpg`], reports: [], brand: [] });
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 42,
      modificationTime: old / 1000,
    });

    const result = await runMediaGc(EMPTY_DB, { logoUri: null }, { nowMs: NOW, dryRun: true });
    expect(result.deleted).toBe(1);
    expect(result.freedBytes).toBe(42);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });
});
