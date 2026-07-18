/**
 * Seed integrity — no remote URLs; SAMPLE labelling; Site Walk theme.
 */

import { buildDemoDb } from "@/lib/seed";

const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockCopyAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  copyAsync: (...args: unknown[]) => mockCopyAsync(...args),
  deleteAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: (mod: number) => ({
      downloadAsync: async () => undefined,
      localUri: `file:///bundle/seed-${mod}.png`,
      uri: `file:///bundle/seed-${mod}.png`,
    }),
  },
}));

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

jest.mock("@/lib/seedAssets", () => ({
  SEED_COVER: 100,
  SEED_ISSUE_PHOTOS: [101, 102, 103, 104, 105, 106, 107, 108],
}));

jest.mock("@/lib/filesWeb", () => ({
  processPickedPhotoWeb: jest.fn(async (uri: string) => ({
    originalUri: `data:image/jpeg;base64,${Buffer.from(uri).toString("base64").slice(0, 8)}`,
    reportUri: `data:image/jpeg;base64,webreport`,
    thumbUri: `data:image/jpeg;base64,webthumb`,
    width: 1200,
    height: 900,
  })),
}));

const platformMock = { OS: "ios" as string };
jest.mock("react-native", () => ({
  Platform: platformMock,
}));

describe("buildDemoDb", () => {
  beforeEach(() => {
    platformMock.OS = "ios";
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: true });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockCopyAsync.mockResolvedValue(undefined);
  });

  it("labels the project as Sample and uses Site Walk theme", async () => {
    const db = await buildDemoDb();
    expect(db.projects[0]?.name).toMatch(/Sample/);
    expect(db.audits[0]?.title).toBe("Pre-Handover Site Walk");
    expect(db.audits[0]?.themeKey).toBe("sitewalk");
    expect(db.audits[0]?.preparedFor).toMatch(/sample/i);
  });

  it("contains no http(s) URLs in seeded media or cover", async () => {
    const db = await buildDemoDb();
    const uris = [
      db.projects[0]?.coverPhotoUri,
      ...db.assets.flatMap((a) => [a.originalUri, a.reportUri, a.thumbUri, a.annotatedUri]),
    ].filter(Boolean) as string[];
    expect(uris.length).toBeGreaterThan(0);
    for (const uri of uris) {
      expect(uri).not.toMatch(/^https?:\/\//i);
    }
  });

  it("materialises one asset per issue when copies succeed", async () => {
    const db = await buildDemoDb();
    expect(db.issues).toHaveLength(8);
    expect(db.assets).toHaveLength(8);
    expect(mockCopyAsync).toHaveBeenCalled();
  });

  it("skips assets honestly when copy fails (no crash)", async () => {
    mockCopyAsync.mockRejectedValue(new Error("ENOSPC"));
    const db = await buildDemoDb();
    expect(db.issues).toHaveLength(8);
    expect(db.assets).toHaveLength(0);
    expect(db.projects[0]?.name).toMatch(/Sample/);
  });
});
