/**
 * Export-all safety archive (LP-05) unit tests.
 *
 * FileSystem/Sharing/JSZip are all mocked — this tests the orchestration
 * (sequential media reads, zip contents, honest failure/cleanup paths,
 * wording) without touching the real filesystem or a real zip codec.
 */

/* eslint-disable import/first -- subject import intentionally follows Jest module mocks */

import type { Db } from "@/lib/store";
import { EMPTY_DB, TABLE_NAMES } from "@/lib/store";
import type { AppSettings, PhotoAsset, Project, ReportExport } from "@/types/models";
import { DEFAULT_SETTINGS } from "@/types/models";
import { WEB_PRINT_SENTINEL } from "@/lib/reportPrintWeb";

const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  moveAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
}));

const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
jest.mock("expo-sharing", () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

const mockShowAlert = jest.fn();
jest.mock("@/lib/dialogs", () => ({ showAlert: (...args: unknown[]) => mockShowAlert(...args) }));

jest.mock("expo-constants", () => ({ expoConfig: { version: "9.9.9" } }));

jest.mock("@/lib/ids", () => ({ nowIso: () => "2026-07-18T00:00:00.000Z" }));

const platformMock = { OS: "ios" as string };
jest.mock("react-native", () => ({ Platform: platformMock }));

const mockZipFile = jest.fn();
const mockGenerateAsync = jest.fn();
jest.mock("jszip", () => {
  return class FakeJSZip {
    file(...args: unknown[]) {
      mockZipFile(...args);
      return this;
    }
    generateAsync(...args: unknown[]) {
      return mockGenerateAsync(...args);
    }
  };
});

import {
  buildExportFilename,
  buildExportManifest,
  buildExportSuccessMessage,
  collectExportMedia,
  EXPORT_FAILURE_MESSAGE,
  EXPORT_FAILURE_TITLE,
  EXPORT_FORMAT_VERSION,
  EXPORT_ROW_SUBCOPY,
  EXPORT_SHARING_UNAVAILABLE_MESSAGE,
  exportAllData,
} from "@/lib/exportArchive";

function baseRecord(id: string) {
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

function makeAsset(partial: Partial<PhotoAsset> & Pick<PhotoAsset, "id">): PhotoAsset {
  return {
    ...baseRecord(partial.id),
    issueId: "i1",
    auditId: "a1",
    projectId: "p1",
    originalUri: `file:///docs/photos/orig_${partial.id}.jpg`,
    reportUri: `file:///docs/photos/report_${partial.id}.jpg`,
    thumbUri: `file:///docs/photos/thumb_${partial.id}.jpg`,
    annotatedUri: null,
    width: 100,
    height: 100,
    capturedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function makeProject(partial: Partial<Project> & Pick<Project, "id">): Project {
  return {
    ...baseRecord(partial.id),
    name: "P",
    reference: "",
    clientName: "",
    siteAddress: "",
    companyName: "",
    inspectorName: "",
    coverPhotoUri: null,
    logoUri: null,
    status: "active",
    ...partial,
  };
}

function makeReport(partial: Partial<ReportExport> & Pick<ReportExport, "id">): ReportExport {
  return {
    ...baseRecord(partial.id),
    auditId: "a1",
    projectId: "p1",
    pdfUri: `file:///docs/reports/${partial.id}.pdf`,
    issueCount: 1,
    photoCount: 1,
    options: {} as ReportExport["options"],
    ...partial,
  };
}

function makeSettings(partial: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}

/* ------------------------------------ buildExportManifest ------------------------------------ */

describe("buildExportManifest", () => {
  it("counts every table and starts with an empty skipped list", () => {
    const db: Db = {
      ...EMPTY_DB,
      projects: [makeProject({ id: "p1" })],
      assets: [makeAsset({ id: "a1" })],
    };
    const manifest = buildExportManifest(db, makeSettings(), {
      appVersion: "1.2.3",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    expect(manifest.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(manifest.appVersion).toBe("1.2.3");
    expect(manifest.createdAt).toBe("2026-05-01T00:00:00.000Z");
    for (const name of TABLE_NAMES) {
      expect(manifest.counts[name]).toBe(db[name].length);
    }
    expect(manifest.skipped).toEqual([]);
  });

  it("falls back to the app version and clock when no overrides are given", () => {
    const manifest = buildExportManifest(EMPTY_DB, makeSettings());
    expect(manifest.appVersion).toBe("9.9.9");
    expect(manifest.createdAt).toBe("2026-07-18T00:00:00.000Z");
  });
});

/* ------------------------------------ collectExportMedia ------------------------------------ */

describe("collectExportMedia", () => {
  it("includes distinct asset variants and dedupes identical uris within the same asset", () => {
    const sameUri = "data:image/jpeg;base64,AAA";
    const asset = makeAsset({
      id: "a1",
      originalUri: sameUri,
      reportUri: sameUri,
      thumbUri: "data:image/jpeg;base64,BBB",
    });
    const media = collectExportMedia({ ...EMPTY_DB, assets: [asset] }, makeSettings());

    expect(media.map((m) => m.role)).toEqual(["asset-original", "asset-thumb"]);
    expect(media[0]).toMatchObject({ id: "a1", role: "asset-original", sourceUri: sameUri });
  });

  it("includes annotated variants, project cover/logo, report pdf, and the settings logo", () => {
    const asset = makeAsset({ id: "a1", annotatedUri: "file:///docs/photos/ann_a1.jpg" });
    const project = makeProject({
      id: "p1",
      coverPhotoUri: "file:///docs/photos/cover.jpg",
      logoUri: "file:///docs/brand/proj.png",
    });
    const report = makeReport({ id: "r1" });
    const settings = makeSettings({ logoUri: "file:///docs/brand/settings.png" });
    const db: Db = { ...EMPTY_DB, assets: [asset], projects: [project], reports: [report] };

    const media = collectExportMedia(db, settings);
    const roles = media.map((m) => m.role);

    expect(roles).toEqual(
      expect.arrayContaining([
        "asset-original",
        "asset-report",
        "asset-thumb",
        "asset-annotated",
        "project-cover",
        "project-logo",
        "report-pdf",
        "settings-logo",
      ]),
    );
    const settingsEntry = media.find((m) => m.role === "settings-logo");
    expect(settingsEntry).toMatchObject({ id: "settings", sourceUri: settings.logoUri });
    expect(settingsEntry?.filename).toBe("settings-logo_settings.png");
  });

  it("omits null media fields without throwing", () => {
    const db: Db = {
      ...EMPTY_DB,
      assets: [makeAsset({ id: "a1", annotatedUri: null })],
      projects: [makeProject({ id: "p1" })],
    };
    const media = collectExportMedia(db, makeSettings());
    expect(media.some((m) => m.role === "asset-annotated")).toBe(false);
    expect(media.some((m) => m.role === "project-cover")).toBe(false);
    expect(media.some((m) => m.role === "project-logo")).toBe(false);
  });
});

/* ------------------------------------ buildExportFilename ------------------------------------ */

describe("buildExportFilename", () => {
  it("formats as punchthis-export-YYYYMMDD-HHmm.zip in local time", () => {
    expect(buildExportFilename(new Date(2026, 6, 18, 20, 5))).toBe("punchthis-export-20260718-2005.zip");
  });

  it("zero-pads single-digit month/day/hour/minute", () => {
    expect(buildExportFilename(new Date(2026, 0, 2, 3, 4))).toBe("punchthis-export-20260102-0304.zip");
  });
});

/* ------------------------------------ exportAllData — native ------------------------------------ */

describe("exportAllData — native", () => {
  beforeEach(() => {
    platformMock.OS = "ios";
    mockGetInfoAsync.mockReset();
    mockReadAsStringAsync.mockReset();
    mockWriteAsStringAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockIsAvailableAsync.mockReset();
    mockShareAsync.mockReset();
    mockShowAlert.mockReset();
    mockZipFile.mockReset();
    mockGenerateAsync.mockReset();
  });

  function dbWithTwoAssets(): Db {
    return { ...EMPTY_DB, assets: [makeAsset({ id: "a1" }), makeAsset({ id: "a2" })] };
  }

  it("reads media strictly sequentially — never two files in flight at once", async () => {
    const order: string[] = [];
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: false });
    mockReadAsStringAsync.mockImplementation(async (uri: string) => {
      order.push(`read:${uri}`);
      return `b64(${uri})`;
    });
    mockZipFile.mockImplementation((path: string) => {
      if (path.startsWith("media/")) order.push(`zip:${path}`);
    });
    mockGenerateAsync.mockResolvedValue("zipbase64");
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);

    const outcome = await exportAllData(dbWithTwoAssets(), makeSettings());

    expect(outcome.ok).toBe(true);
    expect(order).toHaveLength(12); // 2 assets * 3 variants * (read + zip)
    for (let i = 0; i < order.length; i += 2) {
      expect(order[i]).toMatch(/^read:/);
      expect(order[i + 1]).toMatch(/^zip:/);
    }
  });

  it("writes the zip to cacheDirectory with the timestamped filename and shares it", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: false });
    mockReadAsStringAsync.mockResolvedValue("b64data");
    mockGenerateAsync.mockResolvedValue("zipbase64");
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);

    const outcome = await exportAllData(dbWithTwoAssets(), makeSettings());

    expect(outcome).toMatchObject({ ok: true, delivery: "share" });
    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
    const [dest, content, opts] = mockWriteAsStringAsync.mock.calls[0];
    expect(dest).toMatch(/^file:\/\/\/cache\/punchthis-export-\d{8}-\d{4}\.zip$/);
    expect(content).toBe("zipbase64");
    expect(opts).toEqual({ encoding: "base64" });
    expect(mockShareAsync).toHaveBeenCalledWith(dest, { mimeType: "application/zip", UTI: "public.zip-archive" });
  });

  it("records missing files in manifest.skipped instead of silently omitting them", async () => {
    mockGetInfoAsync.mockImplementation(async (uri: string) => ({ exists: !uri.includes("report_") }));
    mockReadAsStringAsync.mockResolvedValue("b64data");
    mockGenerateAsync.mockResolvedValue("zipbase64");
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);

    const outcome = await exportAllData({ ...EMPTY_DB, assets: [makeAsset({ id: "a1" })] }, makeSettings());

    expect(outcome).toMatchObject({ ok: true, skippedCount: 1 });
    const manifestCall = mockZipFile.mock.calls.find(([path]: [string]) => path === "manifest.json");
    expect(manifestCall).toBeDefined();
    const manifestJson = JSON.parse(manifestCall![1] as string);
    expect(manifestJson.skipped).toHaveLength(1);
    expect(manifestJson.skipped[0].reason).toMatch(/no longer exists/i);
    expect(mockZipFile.mock.calls.some(([path]: [string]) => path === "media/asset-report_a1.jpg")).toBe(false);
  });

  it("shows an honest failure dialog and cleans up the temp zip when sharing is unavailable", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadAsStringAsync.mockResolvedValue("b64data");
    mockGenerateAsync.mockResolvedValue("zipbase64");
    mockIsAvailableAsync.mockResolvedValue(false);

    const outcome = await exportAllData(EMPTY_DB, makeSettings());

    expect(outcome.ok).toBe(false);
    expect(mockShowAlert).toHaveBeenCalledWith(EXPORT_FAILURE_TITLE, EXPORT_SHARING_UNAVAILABLE_MESSAGE);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync.mock.calls[0][1]).toEqual({ idempotent: true });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it("cleans up the temp zip when the share sheet itself fails", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadAsStringAsync.mockResolvedValue("b64data");
    mockGenerateAsync.mockResolvedValue("zipbase64");
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockRejectedValue(new Error("share crashed"));

    const outcome = await exportAllData(EMPTY_DB, makeSettings());

    expect(outcome.ok).toBe(false);
    expect(mockShowAlert).toHaveBeenCalledWith(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
  });

  it("fails honestly without writing anything when zip generation throws", async () => {
    mockGenerateAsync.mockRejectedValue(new Error("out of memory"));

    const outcome = await exportAllData(EMPTY_DB, makeSettings());

    expect(outcome.ok).toBe(false);
    expect(mockShowAlert).toHaveBeenCalledWith(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("fails honestly when the write itself fails, without cleaning up a file that was never written", async () => {
    mockGenerateAsync.mockResolvedValue("zipbase64");
    mockWriteAsStringAsync.mockRejectedValue(new Error("disk full"));

    const outcome = await exportAllData(EMPTY_DB, makeSettings());

    expect(outcome.ok).toBe(false);
    expect(mockShowAlert).toHaveBeenCalledWith(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });
});

/* ------------------------------------ exportAllData — web ------------------------------------ */

function installWebDom() {
  const clickMock = jest.fn();
  const anchor: { href: string; download: string; click: () => void } = {
    href: "",
    download: "",
    click: clickMock,
  };
  const createElementMock = jest.fn(() => anchor);
  const appendChildMock = jest.fn();
  const removeChildMock = jest.fn();
  (globalThis as unknown as { document: unknown }).document = {
    createElement: createElementMock,
    body: { appendChild: appendChildMock, removeChild: removeChildMock },
  };
  const createObjectURLMock = jest.fn(() => "blob:fake-url");
  const revokeObjectURLMock = jest.fn();
  (globalThis as unknown as { URL: unknown }).URL = {
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  };
  return { anchor, clickMock, createElementMock, createObjectURLMock, revokeObjectURLMock, appendChildMock, removeChildMock };
}

describe("exportAllData — web", () => {
  let domStubs: ReturnType<typeof installWebDom>;

  beforeEach(() => {
    platformMock.OS = "web";
    mockGetInfoAsync.mockReset();
    mockReadAsStringAsync.mockReset();
    mockWriteAsStringAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockShowAlert.mockReset();
    mockZipFile.mockReset();
    mockGenerateAsync.mockReset();
    domStubs = installWebDom();
  });

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
    delete (globalThis as { URL?: unknown }).URL;
  });

  it("decodes data-URI media and triggers a browser download", async () => {
    mockGenerateAsync.mockResolvedValue({ fake: "blob" });
    const asset = makeAsset({
      id: "a1",
      originalUri: "data:image/jpeg;base64,AAAA",
      reportUri: "data:image/jpeg;base64,BBBB",
      thumbUri: "data:image/jpeg;base64,CCCC",
    });

    const outcome = await exportAllData({ ...EMPTY_DB, assets: [asset] }, makeSettings());

    expect(outcome).toMatchObject({ ok: true, delivery: "download", skippedCount: 0 });
    expect(mockZipFile).toHaveBeenCalledWith("media/asset-original_a1.jpg", "AAAA", { base64: true });
    expect(mockZipFile).toHaveBeenCalledWith("media/asset-report_a1.jpg", "BBBB", { base64: true });
    expect(domStubs.createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(domStubs.clickMock).toHaveBeenCalledTimes(1);
    expect(domStubs.revokeObjectURLMock).toHaveBeenCalledTimes(1);
    expect(domStubs.anchor.download).toMatch(/^punchthis-export-\d{8}-\d{4}\.zip$/);
  });

  it("skips a web-preview PDF sentinel and a remote-URL asset with honest reasons, never silently dropping them", async () => {
    mockGenerateAsync.mockResolvedValue({ fake: "blob" });
    const report = makeReport({ id: "r1", pdfUri: WEB_PRINT_SENTINEL });
    const asset = makeAsset({
      id: "a1",
      originalUri: "https://example.com/remote.jpg",
      reportUri: "data:image/jpeg;base64,BBBB",
      thumbUri: "data:image/jpeg;base64,CCCC",
    });

    const outcome = await exportAllData({ ...EMPTY_DB, assets: [asset], reports: [report] }, makeSettings());

    expect(outcome).toMatchObject({ ok: true, skippedCount: 2 });
    const manifestCall = mockZipFile.mock.calls.find(([path]: [string]) => path === "manifest.json");
    const manifestJson = JSON.parse(manifestCall![1] as string);
    const reasons: string[] = manifestJson.skipped.map((s: { reason: string }) => s.reason);
    expect(reasons.some((r) => /web preview/i.test(r))).toBe(true);
    expect(reasons.some((r) => /remote/i.test(r))).toBe(true);
  });

  it("fails honestly if the browser download trigger throws", async () => {
    mockGenerateAsync.mockResolvedValue({ fake: "blob" });
    domStubs.createElementMock.mockImplementation(() => {
      throw new Error("dom blocked");
    });

    const outcome = await exportAllData(EMPTY_DB, makeSettings());

    expect(outcome.ok).toBe(false);
    expect(mockShowAlert).toHaveBeenCalledWith(EXPORT_FAILURE_TITLE, EXPORT_FAILURE_MESSAGE);
  });
});

/* ------------------------------------ wording ------------------------------------ */

describe("wording", () => {
  it("Settings sub-copy states the archive is for backup/records and is not restorable in-app", () => {
    expect(EXPORT_ROW_SUBCOPY).toMatch(/not restorable/i);
    expect(EXPORT_ROW_SUBCOPY).toMatch(/backup|records/i);
  });

  it("the success message repeats the archival/not-restorable wording regardless of delivery method", () => {
    const shareMsg = buildExportSuccessMessage({ ok: true, filename: "x.zip", delivery: "share", skippedCount: 0, mediaCount: 3 });
    const downloadMsg = buildExportSuccessMessage({ ok: true, filename: "x.zip", delivery: "download", skippedCount: 2, mediaCount: 3 });
    expect(shareMsg).toMatch(/not restorable/i);
    expect(downloadMsg).toMatch(/not restorable/i);
    expect(downloadMsg).toMatch(/2 files/i);
  });

  it("never claims cloud backup, encryption, secure storage, or guaranteed retention", () => {
    const haystack = [
      EXPORT_ROW_SUBCOPY,
      EXPORT_FAILURE_MESSAGE,
      EXPORT_SHARING_UNAVAILABLE_MESSAGE,
      buildExportSuccessMessage({ ok: true, filename: "x", delivery: "share", skippedCount: 0, mediaCount: 0 }),
    ]
      .join("\n")
      .toLowerCase();

    for (const phrase of ["cloud backup", "encrypted", "secure storage", "guaranteed"]) {
      expect(haystack).not.toContain(phrase);
    }
  });
});
