/**
 * Owned-media wipe unit tests — FileSystem mocked (native path).
 */

import { BRAND_DIR, PHOTO_DIR, REPORT_DIR } from "@/lib/files";
import { summarizeWipe, wipeOwnedMediaDirs } from "@/lib/wipe";

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

const platformMock = { OS: "ios" as string };
jest.mock("react-native", () => ({
  Platform: platformMock,
}));

function existsFile() {
  return { exists: true, isDirectory: false };
}

function existsDir() {
  return { exists: true, isDirectory: true };
}

describe("wipeOwnedMediaDirs", () => {
  beforeEach(() => {
    platformMock.OS = "ios";
    mockGetInfoAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockReadDirectoryAsync.mockReset();
  });

  it("deletes files across photos, reports, and brand dirs", async () => {
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (uri === PHOTO_DIR || uri === REPORT_DIR || uri === BRAND_DIR) return existsDir();
      return existsFile();
    });
    mockReadDirectoryAsync.mockImplementation(async (dir: string) => {
      if (dir === PHOTO_DIR) return ["a.jpg", "b.jpg"];
      if (dir === REPORT_DIR) return ["r.pdf"];
      if (dir === BRAND_DIR) return ["logo.png"];
      return [];
    });
    mockDeleteAsync.mockResolvedValue(undefined);

    const result = await wipeOwnedMediaDirs();

    expect(result.ok).toBe(true);
    expect(result.deletedFiles).toBe(4);
    expect(result.failed).toEqual([]);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(4);
    expect(mockDeleteAsync).toHaveBeenCalledWith(`${PHOTO_DIR}a.jpg`, { idempotent: true });
    expect(mockDeleteAsync).toHaveBeenCalledWith(`${PHOTO_DIR}b.jpg`, { idempotent: true });
    expect(mockDeleteAsync).toHaveBeenCalledWith(`${REPORT_DIR}r.pdf`, { idempotent: true });
    expect(mockDeleteAsync).toHaveBeenCalledWith(`${BRAND_DIR}logo.png`, { idempotent: true });
  });

  it("tolerates a missing owned directory", async () => {
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (uri === PHOTO_DIR) return { exists: false };
      if (uri === REPORT_DIR || uri === BRAND_DIR) return existsDir();
      return existsFile();
    });
    mockReadDirectoryAsync.mockImplementation(async (dir: string) => {
      if (dir === REPORT_DIR) return ["only.pdf"];
      if (dir === BRAND_DIR) return [];
      return [];
    });
    mockDeleteAsync.mockResolvedValue(undefined);

    const result = await wipeOwnedMediaDirs();

    expect(result.ok).toBe(true);
    expect(result.deletedFiles).toBe(1);
    expect(mockReadDirectoryAsync).not.toHaveBeenCalledWith(PHOTO_DIR);
    expect(mockDeleteAsync).toHaveBeenCalledWith(`${REPORT_DIR}only.pdf`, { idempotent: true });
  });

  it("collects individual delete failures and sets ok:false", async () => {
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (uri === PHOTO_DIR || uri === REPORT_DIR || uri === BRAND_DIR) return existsDir();
      return existsFile();
    });
    mockReadDirectoryAsync.mockImplementation(async (dir: string) => {
      if (dir === PHOTO_DIR) return ["ok.jpg", "bad.jpg"];
      return [];
    });
    mockDeleteAsync.mockImplementation(async (uri: string) => {
      if (uri.endsWith("bad.jpg")) throw new Error("EPERM locked");
    });

    const result = await wipeOwnedMediaDirs();

    expect(result.ok).toBe(false);
    expect(result.deletedFiles).toBe(1);
    expect(result.failed).toEqual([{ uri: `${PHOTO_DIR}bad.jpg`, error: "EPERM locked" }]);
  });

  it("succeeds when owned dirs exist but are empty", async () => {
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (uri === PHOTO_DIR || uri === REPORT_DIR || uri === BRAND_DIR) return existsDir();
      return { exists: false };
    });
    mockReadDirectoryAsync.mockResolvedValue([]);

    const result = await wipeOwnedMediaDirs();

    expect(result).toEqual({ ok: true, deletedFiles: 0, failed: [] });
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("is a no-op on web (does not touch FileSystem)", async () => {
    platformMock.OS = "web";

    const result = await wipeOwnedMediaDirs();

    expect(result).toEqual({ ok: true, deletedFiles: 0, failed: [] });
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockReadDirectoryAsync).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("treats not-found delete errors as non-failures (idempotent)", async () => {
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (uri === PHOTO_DIR || uri === REPORT_DIR || uri === BRAND_DIR) return existsDir();
      return existsFile();
    });
    mockReadDirectoryAsync.mockImplementation(async (dir: string) => {
      if (dir === PHOTO_DIR) return ["race.jpg"];
      return [];
    });
    mockDeleteAsync.mockRejectedValue(new Error("File does not exist"));

    const result = await wipeOwnedMediaDirs();

    expect(result.ok).toBe(true);
    expect(result.failed).toEqual([]);
    expect(result.deletedFiles).toBe(0);
  });
});

describe("summarizeWipe", () => {
  it("reports success when wipe ok", () => {
    const summary = summarizeWipe({ ok: true, deletedFiles: 3, failed: [] });
    expect(summary.success).toBe(true);
    expect(summary.message).toMatch(/photo\/report files/i);
    expect(summary.message).toMatch(/deleted/i);
  });

  it("reports partial failure with count and safe retry guidance", () => {
    const summary = summarizeWipe({
      ok: false,
      deletedFiles: 2,
      failed: [
        { uri: `${PHOTO_DIR}a.jpg`, error: "busy" },
        { uri: `${PHOTO_DIR}b.jpg`, error: "busy" },
      ],
    });
    expect(summary.success).toBe(false);
    expect(summary.message).toMatch(/2 files could not be deleted/i);
    expect(summary.message).toMatch(/Clear all data again/i);
    expect(summary.message).toMatch(/safe to re-run/i);
  });
});
