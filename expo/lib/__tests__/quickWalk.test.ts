import {
  buildQuickWalkAuditInput,
  buildQuickWalkProjectInput,
  measureTimeToFirstIssue,
  resolveQuickWalkThemeKey,
  shouldStartQuickWalkWithNewProject,
} from "@/lib/quickWalk";
import { DEFAULT_REPORT_OPTIONS } from "@/types/models";

describe("buildQuickWalkProjectInput", () => {
  it("trims name and copies inspector/company from settings", () => {
    expect(
      buildQuickWalkProjectInput("  Site A  ", {
        companyName: " Acme ",
        inspectorName: " Pat ",
      }),
    ).toEqual({
      name: "Site A",
      reference: "",
      clientName: "",
      siteAddress: "",
      companyName: "Acme",
      inspectorName: "Pat",
      coverPhotoUri: null,
      logoUri: null,
    });
  });
});

describe("shouldStartQuickWalkWithNewProject", () => {
  it("protects a real first capture from being added to the bundled sample", () => {
    expect(
      shouldStartQuickWalkWithNewProject([{ name: "Sample — Harbourview Apartments Stage 2" }]),
    ).toBe(true);
  });

  it("uses the first real project and creates a project when no projects exist", () => {
    expect(shouldStartQuickWalkWithNewProject([])).toBe(true);
    expect(shouldStartQuickWalkWithNewProject([{ name: "My active site" }])).toBe(false);
  });
});

describe("resolveQuickWalkThemeKey", () => {
  it("maps executive default to sitewalk for field capture", () => {
    expect(resolveQuickWalkThemeKey("executive")).toBe("sitewalk");
  });

  it("keeps explicit sitewalk / handover", () => {
    expect(resolveQuickWalkThemeKey("sitewalk")).toBe("sitewalk");
    expect(resolveQuickWalkThemeKey("handover")).toBe("handover");
  });
});

describe("buildQuickWalkAuditInput", () => {
  it("builds Site Walk title and project client defaults", () => {
    const audit = buildQuickWalkAuditInput(
      { id: "p1", clientName: "Meridian", inspectorName: "Alex" },
      {
        inspectorName: "Fallback",
        defaultReportOptions: { ...DEFAULT_REPORT_OPTIONS, themeKey: "executive" },
      },
      new Date("2026-07-18T12:00:00.000Z"),
    );
    expect(audit.projectId).toBe("p1");
    expect(audit.title).toMatch(/^Site Walk — /);
    expect(audit.preparedFor).toBe("Meridian");
    expect(audit.preparedBy).toBe("Alex");
    expect(audit.themeKey).toBe("sitewalk");
    expect(audit.defaultLocationId).toBeNull();
    expect(audit.defaultAssigneeId).toBeNull();
  });
});

describe("measureTimeToFirstIssue", () => {
  it("returns duration when start is valid", () => {
    const result = measureTimeToFirstIssue(1_000, 4_500);
    expect(result).toEqual({
      startedAtMs: 1_000,
      savedAtMs: 4_500,
      durationMs: 3_500,
      durationSec: 4,
    });
  });

  it("rejects invalid start", () => {
    expect(measureTimeToFirstIssue(0, 100)).toBeNull();
    expect(measureTimeToFirstIssue(200, 100)).toBeNull();
  });
});
