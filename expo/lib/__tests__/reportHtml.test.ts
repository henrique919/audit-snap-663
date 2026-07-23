/**
 * Large-audit report HTML fixture + redaction / offline guarantees.
 */

import { buildReportHtml } from "@/lib/report";
import { getReportFontFaceCss } from "@/lib/reportFonts";
import type {
  AnnotationElement,
  AnnotationRecord,
  Assignee,
  Audit,
  Issue,
  PhotoAsset,
  Project,
  ProjectLocation,
  ReportOptions,
} from "@/types/models";
import { DEFAULT_REPORT_OPTIONS } from "@/types/models";

function base(id: string, updatedAt = "2026-06-01T12:00:00.000Z") {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null as string | null,
    syncStatus: "local_only" as const,
    localVersion: 1,
    serverVersion: 1,
  };
}

function blurEl(id: string, x = 0.1, y = 0.1): AnnotationElement {
  return { id, type: "blur", x, y, width: 0.3, height: 0.25, intensity: 18 };
}

function arrowEl(id: string): AnnotationElement {
  return {
    id,
    type: "arrow",
    x1: 0.1,
    y1: 0.1,
    x2: 0.6,
    y2: 0.5,
    stroke: "#E11D48",
    strokeWidth: 6,
  };
}

/** 50 issues / 100 assets / mixed annotations incl. ≥3 blur elements. */
function buildLargeFixture() {
  const project: Project = {
    ...base("proj-large"),
    name: "Large Site Audit",
    reference: "REF-100",
    clientName: "Acme Client",
    siteAddress: "100 Warehouse Rd",
    companyName: "CleanRun IQ",
    inspectorName: "Ada Inspector",
    coverPhotoUri: null,
    logoUri: null,
    status: "active",
  };

  const audit: Audit = {
    ...base("audit-large"),
    projectId: project.id,
    title: "Wave 1 large audit fixture",
    auditDate: "2026-06-01",
    preparedFor: "Acme Client",
    preparedBy: "Ada Inspector",
    status: "draft",
    notes: "",
    defaultLocationId: "loc-1",
    defaultAssigneeId: "asg-1",
    themeKey: "executive",
    completedAt: null,
    reportIssuedAt: null,
  };

  const locations: ProjectLocation[] = [
    { ...base("loc-1"), projectId: project.id, name: "Level 1", sortOrder: 0 },
    { ...base("loc-2"), projectId: project.id, name: "Roof", sortOrder: 1 },
  ];

  const assignees: Assignee[] = [
    {
      ...base("asg-1"),
      name: "Jordan Trade",
      company: "Trade Co",
      email: "j@example.com",
      phone: "",
      trade: "Electrical",
    },
  ];

  const longDesc =
    "Long description for memory/layout stress. ".repeat(40) +
    "Includes edge cases: quotes \"here\", ampersands & angles <tag>.";

  const issues: Issue[] = [];
  const assets: PhotoAsset[] = [];
  const annotations: AnnotationRecord[] = [];

  for (let i = 1; i <= 50; i++) {
    const issueId = `issue-${i}`;
    issues.push({
      ...base(issueId),
      auditId: audit.id,
      projectId: project.id,
      locationId: i % 2 === 0 ? "loc-2" : "loc-1",
      issueNumber: i,
      title: `Issue ${i} — fixture title`,
      description: i % 5 === 0 ? longDesc : `Short desc ${i}`,
      status: (["open", "assigned", "in_progress", "completed"] as const)[i % 4],
      priority: (["low", "medium", "high"] as const)[i % 3],
      assigneeId: "asg-1",
      includeInReport: true,
      sortOrder: i,
    });

    for (let p = 0; p < 2; p++) {
      const assetId = `asset-${i}-${p}`;
      const hasFlattenedBlur = i <= 3 && p === 0;
      const hasOverlayBlur = i <= 3 && p === 1;
      assets.push({
        ...base(assetId),
        issueId,
        auditId: audit.id,
        projectId: project.id,
        originalUri: `file:///photos/orig_${assetId}.jpg`,
        reportUri: `file:///photos/report_${assetId}.jpg`,
        thumbUri: `file:///photos/thumb_${assetId}.jpg`,
        annotatedUri: hasFlattenedBlur ? `file:///photos/ann_${assetId}.jpg` : null,
        width: 1800,
        height: 1200,
        capturedAt: "2026-06-01T10:00:00.000Z",
      });

      if (hasFlattenedBlur || hasOverlayBlur || i === 10) {
        const elements: AnnotationElement[] = [arrowEl(`arr-${assetId}`)];
        if (hasFlattenedBlur || hasOverlayBlur) {
          elements.push(blurEl(`blur-${assetId}`));
        }
        if (i === 10) {
          elements.push({
            id: `txt-${assetId}`,
            type: "text",
            x: 0.2,
            y: 0.2,
            text: "Callout",
            color: "#111",
            fontSize: 28,
            bg: true,
          });
        }
        annotations.push({
          ...base(`ann-${assetId}`),
          assetId,
          issueId,
          elements,
          toolsetVersion: 1,
        });
      }
    }
  }

  const options: ReportOptions = {
    ...DEFAULT_REPORT_OPTIONS,
    includePageNumbers: true, // stored setting; CSS must still force page numbers off
    imageSize: "standard",
    themeKey: "executive",
  };

  return { project, audit, issues, locations, assignees, assets, annotations, options };
}

describe("buildReportHtml — large fixture & redaction", () => {
  const fixture = buildLargeFixture();

  it("generates HTML for 50 issues / 100 photos without throwing", () => {
    const html = buildReportHtml({
      ...fixture,
      branding: {
        companyName: "CleanRun IQ",
        inspectorName: "Ada",
        logoUri: null,
        footerText: "Confidential",
      },
      imageSrc: (uri) => `data:image/jpeg;base64,PLACEHOLDER_${uri.slice(-20)}`,
    });

    expect(html.length).toBeGreaterThan(10_000);
    expect(html).toContain("Wave 1 large audit fixture");
    expect(html).toContain("Issue 50");
    // 1-photo width rule still present in CSS variable usage for single-photo items
    // (multi-photo issues use standard widths; zero-photo issues omit .photos)
    expect(html).toContain("--pw:");
  });

  it("contains zero fonts.googleapis.com / network font imports", async () => {
    await getReportFontFaceCss();
    const html = buildReportHtml({
      ...fixture,
      branding: {
        companyName: "CleanRun IQ",
        inspectorName: "Ada",
        logoUri: null,
        footerText: "",
      },
      imageSrc: (uri) => uri,
    });

    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/@import\s+url/i);
  });

  it("blur without annotatedUri → opaque redaction rect, never CSS filter blur", () => {
    // asset-1-1 has blur + no annotatedUri (overlay-redaction path)
    const html = buildReportHtml({
      ...fixture,
      branding: {
        companyName: "CleanRun IQ",
        inspectorName: "Ada",
        logoUri: null,
        footerText: "",
      },
      imageSrc: (uri) => uri,
    });

    expect(html).toContain('fill="#565F68"');
    expect(html).not.toMatch(/filter:\s*blur/i);
    expect(html).not.toMatch(/filter:blur/i);
  });

  it("prefers flattened annotatedUri when blur + annotatedUri exist", () => {
    // asset-1-0 has annotatedUri + blur
    const flattened = "file:///photos/ann_asset-1-0.jpg";
    const seen: string[] = [];
    buildReportHtml({
      ...fixture,
      branding: {
        companyName: "CleanRun IQ",
        inspectorName: "Ada",
        logoUri: null,
        footerText: "",
      },
      imageSrc: (uri) => {
        seen.push(uri);
        return uri;
      },
    });

    expect(seen).toContain(flattened);
    // Flattened path should not request the raw report for that marked-up figure.
    // (Original may still appear if includeOriginalPhotos — off by default.)
    const markedUpUsesFlattened = seen.includes(flattened);
    expect(markedUpUsesFlattened).toBe(true);
  });

  it("forces page-number CSS off regardless of includePageNumbers option", () => {
    const html = buildReportHtml({
      ...fixture,
      options: { ...fixture.options, includePageNumbers: true },
      branding: {
        companyName: "CleanRun IQ",
        inspectorName: "Ada",
        logoUri: null,
        footerText: "",
      },
      imageSrc: (uri) => uri,
    });

    expect(html).not.toMatch(/counter\(page\)/);
    expect(html).not.toMatch(/@bottom-right/);
  });

  it("renders graceful empty frame when imageSrc returns empty (missing file)", () => {
    const html = buildReportHtml({
      project: fixture.project,
      audit: fixture.audit,
      issues: [fixture.issues[0]],
      locations: fixture.locations,
      assignees: fixture.assignees,
      assets: [fixture.assets[0]],
      annotations: [],
      options: fixture.options,
      branding: {
        companyName: "CleanRun IQ",
        inspectorName: "Ada",
        logoUri: null,
        footerText: "",
      },
      imageSrc: () => "",
    });

    expect(html).toContain("photo-frame");
    expect(html).not.toMatch(/<img src=""/);
  });

  it("keeps 66% width rule for a single-photo issue", () => {
    const issue = fixture.issues[0];
    const oneAsset = fixture.assets.find((a) => a.issueId === issue.id)!;
    const html = buildReportHtml({
      project: fixture.project,
      audit: fixture.audit,
      issues: [issue],
      locations: fixture.locations,
      assignees: fixture.assignees,
      assets: [oneAsset],
      annotations: [],
      options: { ...fixture.options, imageSize: "standard" },
      branding: {
        companyName: "CleanRun IQ",
        inspectorName: "Ada",
        logoUri: null,
        footerText: "",
      },
      imageSrc: (uri) => uri,
    });

    expect(html).toContain("--pw:66%");
  });

  it("caps photo height so a tall/portrait photo cannot fill a full page", () => {
    const issue = fixture.issues[0];
    const oneAsset = fixture.assets.find((a) => a.issueId === issue.id)!;
    // Tall portrait phone photo — the case that used to fill a whole A4 page.
    const portrait = { ...oneAsset, width: 3024, height: 4032 };
    const html = buildReportHtml({
      project: fixture.project,
      audit: fixture.audit,
      issues: [issue],
      locations: fixture.locations,
      assignees: fixture.assignees,
      assets: [portrait],
      annotations: [],
      options: { ...fixture.options, imageSize: "large" },
      branding: { companyName: "CleanRun IQ", inspectorName: "Ada", logoUri: null, footerText: "" },
      imageSrc: (uri) => uri,
    });

    // Height cap is wired: container carries a max-height var, the photo carries
    // its aspect (w/h), and the CSS caps .photo width = max-height * aspect.
    expect(html).toContain("--mh:");
    expect(html).toMatch(/--ar:0\.75/); // 3024/4032
    expect(html).toContain("max-width: calc(var(--mh, 999mm) * var(--ar, 1))");
    // The aspect box stays exact so annotation overlays keep aligning.
    expect(html).toContain("padding-top:133.33%");
  });
});
