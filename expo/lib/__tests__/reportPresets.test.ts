import {
  getPresetSummary,
  projectThemeMemoryPatch,
  resolveInitialReportTheme,
} from "@/lib/reportPresets";

describe("resolveInitialReportTheme", () => {
  it("prefers project memory over audit and settings", () => {
    expect(
      resolveInitialReportTheme({
        projectTheme: "handover",
        auditTheme: "sitewalk",
        settingsTheme: "executive",
      }),
    ).toBe("handover");
  });

  it("falls back to audit then settings", () => {
    expect(
      resolveInitialReportTheme({
        projectTheme: null,
        auditTheme: "sitewalk",
        settingsTheme: "executive",
      }),
    ).toBe("sitewalk");
    expect(
      resolveInitialReportTheme({
        projectTheme: undefined,
        auditTheme: null,
        settingsTheme: "executive",
      }),
    ).toBe("executive");
  });
});

describe("getPresetSummary", () => {
  it("returns a non-empty summary per theme", () => {
    for (const key of ["executive", "sitewalk", "handover"] as const) {
      expect(getPresetSummary(key).length).toBeGreaterThan(20);
    }
  });
});

describe("projectThemeMemoryPatch", () => {
  it("stores the selected theme key", () => {
    expect(projectThemeMemoryPatch("sitewalk")).toEqual({ lastReportThemeKey: "sitewalk" });
  });
});
