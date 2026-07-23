import { FeatureKey, getEntitlements, isEntitled, refreshEntitlements } from "@/lib/entitlements";

describe("entitlements stub", () => {
  it("returns plan founder with every feature true", () => {
    const ent = getEntitlements();
    expect(ent.plan).toBe("founder");
    const keys: FeatureKey[] = ["csv_export", "custom_themes", "cloud_backup", "multi_project", "closeout_links"];
    for (const k of keys) {
      expect(ent.features[k]).toBe(true);
    }
  });

  it("isEntitled fails open — true for every feature in the stub", () => {
    expect(isEntitled("csv_export")).toBe(true);
    expect(isEntitled("cloud_backup")).toBe(true);
  });

  it("refreshEntitlements is a no-op that resolves", async () => {
    await expect(refreshEntitlements()).resolves.toBeUndefined();
  });
});
