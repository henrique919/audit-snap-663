import {
  buildAccountLogoPath,
  buildPhotoAssetPath,
  buildProjectCoverPath,
  buildProjectLogoPath,
  buildReportExportPath,
  isSupabaseRef,
  needsUpload,
  parseSupabaseRef,
  STORAGE_BUCKETS,
  toSupabaseRef,
} from "@/lib/supabase/storagePaths";

describe("toSupabaseRef / parseSupabaseRef / isSupabaseRef", () => {
  it("round-trips a bucket + path", () => {
    const ref = toSupabaseRef("project-media", "owner/proj/issue/asset/original.jpg");
    expect(ref).toBe("supabase://project-media/owner/proj/issue/asset/original.jpg");
    expect(isSupabaseRef(ref)).toBe(true);
    expect(parseSupabaseRef(ref)).toEqual({
      bucket: "project-media",
      path: "owner/proj/issue/asset/original.jpg",
    });
  });

  it("returns null for local file URIs, http URLs, and empty values", () => {
    expect(parseSupabaseRef("file:///tmp/photo.jpg")).toBeNull();
    expect(parseSupabaseRef("https://example.com/a.jpg")).toBeNull();
    expect(parseSupabaseRef(null)).toBeNull();
    expect(parseSupabaseRef(undefined)).toBeNull();
    expect(parseSupabaseRef("")).toBeNull();
    expect(isSupabaseRef("file:///tmp/photo.jpg")).toBe(false);
  });

  it("rejects malformed refs (missing bucket or path)", () => {
    expect(parseSupabaseRef("supabase://")).toBeNull();
    expect(parseSupabaseRef("supabase://bucket-only")).toBeNull();
    expect(parseSupabaseRef("supabase://bucket/")).toBeNull();
  });
});

describe("path builders", () => {
  it("builds photo asset variant paths under project-media", () => {
    const result = buildPhotoAssetPath("owner1", "proj1", "issue1", "asset1", "report", "photo.HEIC");
    expect(result.bucket).toBe(STORAGE_BUCKETS.projectMedia);
    expect(result.path).toBe("owner1/proj1/issue1/asset1/report.heic");
  });

  it("defaults to jpg when the source has no extension", () => {
    const result = buildPhotoAssetPath("owner1", "proj1", "issue1", "asset1", "original", null);
    expect(result.path).toBe("owner1/proj1/issue1/asset1/original.jpg");
  });

  it("builds project cover and logo paths", () => {
    expect(buildProjectCoverPath("owner1", "proj1", "x.png").path).toBe("owner1/proj1/cover.png");
    expect(buildProjectLogoPath("owner1", "proj1").path).toBe("owner1/proj1/logo.png");
  });

  it("builds the account logo path", () => {
    const result = buildAccountLogoPath("owner1", "x.jpg");
    expect(result.bucket).toBe(STORAGE_BUCKETS.projectMedia);
    expect(result.path).toBe("owner1/account/logo.jpg");
  });

  it("builds report export paths under report-files", () => {
    const result = buildReportExportPath("owner1", "audit1", "report1");
    expect(result.bucket).toBe(STORAGE_BUCKETS.reportFiles);
    expect(result.path).toBe("owner1/audit1/report1.pdf");
  });
});

describe("needsUpload", () => {
  it("is true only for local, non-remote URIs", () => {
    expect(needsUpload("file:///tmp/a.jpg")).toBe(true);
    expect(needsUpload("content://media/a.jpg")).toBe(true);
    expect(needsUpload("supabase://project-media/a/b.jpg")).toBe(false);
    expect(needsUpload("https://example.com/a.jpg")).toBe(false);
    expect(needsUpload(null)).toBe(false);
    expect(needsUpload("")).toBe(false);
  });
});
