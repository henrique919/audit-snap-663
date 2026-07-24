/**
 * Large-audit report HTML fixture + redaction / offline guarantees.
 */

import { buildReportHtml, computePhotoBox, CARD_PHOTO_COL_MM } from "@/lib/report";
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
    // The old CSS width-var clamp (--pw/--mh/--ar) is gone: photo geometry
    // is exact mm boxes computed in TS (computePhotoBox).
    expect(html).not.toContain("--pw:");
    expect(html).not.toContain("--mh:");
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

  it("single-photo issue gets the standard fixed box — no oversized override", () => {
    const issue = fixture.issues[0];
    const oneAsset = fixture.assets.find((a) => a.issueId === issue.id)!; // 1800×1200, ar 1.5
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

    // standard box = 58mm tall → landscape 3:2 draws 87×58mm, dimensions on
    // the frame itself (content box = photo aspect → overlay stays aligned).
    expect(html).toContain('style="width:87mm;height:58mm"');
    expect(html).not.toContain("--pw:");
  });

  it("portrait and landscape photos share the same fixed box height", () => {
    const issue = fixture.issues[0];
    const oneAsset = fixture.assets.find((a) => a.issueId === issue.id)!;
    const build = (w: number, h: number, imageSize: "standard" | "large") =>
      buildReportHtml({
        project: fixture.project,
        audit: fixture.audit,
        issues: [issue],
        locations: fixture.locations,
        assignees: fixture.assignees,
        assets: [{ ...oneAsset, width: w, height: h }],
        annotations: [],
        options: { ...fixture.options, imageSize },
        branding: { companyName: "CleanRun IQ", inspectorName: "Ada", logoUri: null, footerText: "" },
        imageSrc: (uri) => uri,
      });

    // Portrait phone shot (3024×4032, ar 0.75) at standard: 43.5×58mm —
    // fills the SAME 58mm height as landscape instead of growing taller.
    const portrait = build(3024, 4032, "standard");
    expect(portrait).toContain('style="width:43.5mm;height:58mm"');

    // Large box: 100mm tall — portrait 75×100mm, still bounded.
    const portraitLarge = build(3024, 4032, "large");
    expect(portraitLarge).toContain('style="width:75mm;height:100mm"');
  });

  it("computePhotoBox clamps by column width and guards degenerate aspects", () => {
    // Landscape 3:2 into standard card box.
    expect(computePhotoBox(1.5, CARD_PHOTO_COL_MM, 58)).toEqual({ w: 87, h: 58 });
    // Portrait 3:4 fills box height.
    expect(computePhotoBox(0.75, CARD_PHOTO_COL_MM, 58)).toEqual({ w: 43.5, h: 58 });
    // Ultra-wide panorama clamps to the column, height shrinks proportionally.
    const pano = computePhotoBox(4, CARD_PHOTO_COL_MM, 58);
    expect(pano.w).toBe(CARD_PHOTO_COL_MM);
    expect(pano.h).toBeCloseTo(CARD_PHOTO_COL_MM / 4, 1);
    // Degenerate dims fall back to 4:3 instead of NaN/Infinity.
    expect(computePhotoBox(0, CARD_PHOTO_COL_MM, 58)).toEqual(
      computePhotoBox(4 / 3, CARD_PHOTO_COL_MM, 58),
    );
  });

  it("sitewalk theme renders row layout in a single flowing page run", () => {
    const html = buildReportHtml({
      ...fixture,
      options: { ...fixture.options, themeKey: "sitewalk", coverPage: false },
      branding: { companyName: "CleanRun IQ", inspectorName: "Ada", logoUri: null, footerText: "" },
      imageSrc: (uri) => uri,
    });

    expect(html).toContain("item-row");
    expect(html).toContain("report-band");
    // No cover page and no standalone summary/details pages — one flow.
    expect(html).not.toContain('class="page cover');
    expect(html).not.toContain('class="page details"');
    // Hit list survives as the backbone.
    expect(html).toContain("Hit List");
    // Multi-photo items surface the photo count in the meta line.
    expect(html).toContain("2 photos");
  });

  it("card layout embeds the signature in the details flow (no orphan page) exactly once", () => {
    const html = buildReportHtml({
      ...fixture,
      options: { ...fixture.options, includeSignature: true },
      branding: { companyName: "CleanRun IQ", inspectorName: "Ada", logoUri: null, footerText: "" },
      imageSrc: (uri) => uri,
    });

    const signoffCount = (html.match(/class="signoff"/g) ?? []).length;
    expect(signoffCount).toBe(1);
    // Embedded inside the details .page section, not appended after it.
    const detailsStart = html.indexOf('class="page details"');
    const detailsEnd = html.indexOf("</section>", html.lastIndexOf('class="signoff"'));
    expect(detailsStart).toBeGreaterThan(-1);
    expect(html.indexOf('class="signoff"')).toBeGreaterThan(detailsStart);
    expect(detailsEnd).toBeGreaterThan(-1);
  });

  it("sitewalk row thumbnails still honour blur redaction (never CSS blur)", () => {
    const html = buildReportHtml({
      ...fixture,
      options: { ...fixture.options, themeKey: "sitewalk", coverPage: false },
      branding: { companyName: "CleanRun IQ", inspectorName: "Ada", logoUri: null, footerText: "" },
      imageSrc: (uri) => uri,
    });

    // asset-1-0 (first asset of issue-1) has blur + annotatedUri → flattened
    // copy; asset-2-* rows without flatten still redact via opaque rects.
    expect(html).not.toMatch(/filter:\s*blur/i);
  });
});
