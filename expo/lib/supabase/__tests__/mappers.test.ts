import {
  annotationFromRow,
  annotationToRow,
  appSettingsFromRow,
  appSettingsToRow,
  assigneeFromRow,
  assigneeToRow,
  auditFromRow,
  auditToRow,
  issueFromRow,
  issueToRow,
  locationFromRow,
  locationToRow,
  photoAssetFromRow,
  photoAssetToRow,
  projectFromRow,
  projectToRow,
  reportExportFromRow,
  reportExportToRow,
} from "@/lib/supabase/mappers";
import { DEFAULT_SETTINGS, type AnnotationRecord, type Assignee, type Audit, type Issue, type PhotoAsset, type Project, type ProjectLocation, type ReportExport } from "@/types/models";

const OWNER = "owner-uuid-1";

function base() {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    deletedAt: null as string | null,
    syncStatus: "pending_upload" as const,
    localVersion: 2,
    serverVersion: 1,
  };
}

describe("projects mapper", () => {
  it("injects owner_id and maps camel <-> snake, including cover/logo refs", () => {
    const project: Project = {
      ...base(),
      id: "p1",
      name: "HQ Fitout",
      reference: "REF-1",
      clientName: "Acme",
      siteAddress: "1 Main St",
      companyName: "PunchThis Co",
      inspectorName: "Alex",
      coverPhotoUri: "supabase://project-media/owner-uuid-1/p1/cover.jpg",
      logoUri: "file:///tmp/logo.png",
      status: "active",
      lastReportThemeKey: "sitewalk",
    };

    const row = projectToRow(project, OWNER);
    expect(row.owner_id).toBe(OWNER);
    expect(row.cover_bucket).toBe("project-media");
    expect(row.cover_path).toBe("owner-uuid-1/p1/cover.jpg");
    // Local (not-yet-uploaded) logo URI has no ref to parse -> null bucket/path.
    expect(row.logo_bucket).toBeNull();
    expect(row.logo_path).toBeNull();
    expect(row.last_report_theme_key).toBe("sitewalk");

    const fullRow = {
      id: "p1",
      owner_id: OWNER,
      name: "HQ Fitout",
      reference: "REF-1",
      client_name: "Acme",
      site_address: "1 Main St",
      company_name: "PunchThis Co",
      inspector_name: "Alex",
      cover_bucket: "project-media",
      cover_path: "owner-uuid-1/p1/cover.jpg",
      logo_bucket: null,
      logo_path: null,
      status: "active",
      last_report_theme_key: "sitewalk",
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      deleted_at: null,
      local_version: 2,
      server_version: 1,
      sync_status: "pending_upload" as const,
    };
    const roundTripped = projectFromRow(fullRow);
    expect(roundTripped.coverPhotoUri).toBe("supabase://project-media/owner-uuid-1/p1/cover.jpg");
    expect(roundTripped.logoUri).toBeNull();
    expect(roundTripped.lastReportThemeKey).toBe("sitewalk");
    expect(roundTripped.name).toBe("HQ Fitout");
    expect(roundTripped.status).toBe("active");
  });

  it("resolves legacy theme keys and falls back for invalid status", () => {
    const row = {
      id: "p2",
      owner_id: OWNER,
      name: "X",
      reference: "",
      client_name: "",
      site_address: "",
      company_name: "",
      inspector_name: "",
      cover_bucket: null,
      cover_path: null,
      logo_bucket: null,
      logo_path: null,
      status: "weird" as unknown as string,
      last_report_theme_key: "navy",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
      local_version: 1,
      server_version: 1,
      sync_status: "synced" as const,
    };
    const project = projectFromRow(row);
    expect(project.status).toBe("active");
    expect(project.lastReportThemeKey).toBe("executive");
  });
});

describe("locations / assignees / audits / issues mappers", () => {
  it("maps project_locations", () => {
    const location: ProjectLocation = { ...base(), id: "l1", projectId: "p1", name: "Roof", sortOrder: 3 };
    const row = locationToRow(location, OWNER);
    expect(row).toMatchObject({ owner_id: OWNER, project_id: "p1", name: "Roof", sort_order: 3 });
    const back = locationFromRow({ ...row, id: "l1" } as never);
    expect(back.projectId).toBe("p1");
    expect(back.sortOrder).toBe(3);
  });

  it("maps assignees", () => {
    const assignee: Assignee = { ...base(), id: "a1", name: "Sam", company: "Acme", email: "s@x.com", phone: "555", trade: "Electrical" };
    const row = assigneeToRow(assignee, OWNER);
    expect(row.owner_id).toBe(OWNER);
    const back = assigneeFromRow({ ...row, id: "a1" } as never);
    expect(back.name).toBe("Sam");
    expect(back.trade).toBe("Electrical");
  });

  it("maps audits, coercing invalid status/theme on the way back", () => {
    const audit: Audit = {
      ...base(),
      id: "au1",
      projectId: "p1",
      title: "Q1 Walk",
      auditDate: "2026-01-15",
      preparedFor: "Client",
      preparedBy: "Alex",
      status: "completed",
      notes: "",
      defaultLocationId: null,
      defaultAssigneeId: null,
      themeKey: "handover",
      completedAt: "2026-01-16T00:00:00.000Z",
      reportIssuedAt: null,
    };
    const row = auditToRow(audit, OWNER);
    expect(row.owner_id).toBe(OWNER);
    expect(row.theme_key).toBe("handover");
    const back = auditFromRow({ ...row, id: "au1", status: "bogus" } as never);
    expect(back.status).toBe("draft");
    expect(back.themeKey).toBe("handover");
  });

  it("maps issues, normalising unknown status/priority", () => {
    const issue: Issue = {
      ...base(),
      id: "i1",
      auditId: "au1",
      projectId: "p1",
      locationId: "l1",
      issueNumber: 1,
      title: "Crack",
      description: "wall crack",
      status: "in_progress",
      priority: "high",
      assigneeId: "a1",
      includeInReport: true,
      sortOrder: 0,
    };
    const row = issueToRow(issue, OWNER);
    expect(row.owner_id).toBe(OWNER);
    expect(row.issue_number).toBe(1);
    const back = issueFromRow({ ...row, id: "i1", status: "??", priority: "??" } as never);
    expect(back.status).toBe("open");
    expect(back.priority).toBe("medium");
  });
});

describe("photo asset mapper", () => {
  const photo: PhotoAsset = {
    ...base(),
    id: "asset1",
    issueId: "i1",
    auditId: "au1",
    projectId: "p1",
    originalUri: "file:///tmp/orig.jpg",
    reportUri: "supabase://project-media/owner-uuid-1/p1/i1/asset1/report.jpg",
    thumbUri: "file:///tmp/thumb.jpg",
    annotatedUri: null,
    width: 100,
    height: 200,
    capturedAt: "2026-01-01T00:00:00.000Z",
  };

  it("only sends bucket/path for variants that are already supabase refs", () => {
    const row = photoAssetToRow(photo, OWNER);
    expect(row.owner_id).toBe(OWNER);
    expect(row.original_bucket).toBeNull();
    expect(row.report_bucket).toBe("project-media");
    expect(row.report_path).toBe("owner-uuid-1/p1/i1/asset1/report.jpg");
    expect(row.thumb_bucket).toBeNull();
    expect(row.annotated_bucket).toBeNull();
  });

  it("accepts explicit overrides for freshly-uploaded variants", () => {
    const row = photoAssetToRow(photo, OWNER, {
      original: { bucket: "project-media", path: "owner-uuid-1/p1/i1/asset1/original.jpg" },
    });
    expect(row.original_bucket).toBe("project-media");
    expect(row.original_path).toBe("owner-uuid-1/p1/i1/asset1/original.jpg");
  });

  it("falls back to the existing local URI when the row has no ref yet, and to empty string when there is no fallback", () => {
    const row = {
      id: "asset1",
      owner_id: OWNER,
      issue_id: "i1",
      audit_id: "au1",
      project_id: "p1",
      original_bucket: null,
      original_path: null,
      report_bucket: "project-media",
      report_path: "owner-uuid-1/p1/i1/asset1/report.jpg",
      thumb_bucket: null,
      thumb_path: null,
      annotated_bucket: null,
      annotated_path: null,
      width: 100,
      height: 200,
      captured_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
      local_version: 1,
      server_version: 1,
      sync_status: "synced" as const,
    };
    const withFallback = photoAssetFromRow(row, { originalUri: "file:///tmp/orig.jpg" });
    expect(withFallback.originalUri).toBe("file:///tmp/orig.jpg");
    expect(withFallback.reportUri).toBe("supabase://project-media/owner-uuid-1/p1/i1/asset1/report.jpg");
    expect(withFallback.annotatedUri).toBeNull();

    const withoutFallback = photoAssetFromRow(row);
    expect(withoutFallback.originalUri).toBe("");
  });
});

describe("annotation record mapper", () => {
  it("round-trips elements JSON and defaults to [] for malformed data", () => {
    const annotation: AnnotationRecord = {
      ...base(),
      id: "an1",
      assetId: "asset1",
      issueId: "i1",
      elements: [{ id: "e1", type: "text", x: 0.1, y: 0.2, text: "hi", color: "#fff", fontSize: 12 }],
      toolsetVersion: 1,
    };
    const row = annotationToRow(annotation, OWNER);
    expect(row.owner_id).toBe(OWNER);
    expect(row.elements).toEqual(annotation.elements);

    const back = annotationFromRow({ ...row, id: "an1" } as never);
    expect(back.elements).toEqual(annotation.elements);

    const malformed = annotationFromRow({ ...row, id: "an1", elements: "not-an-array" } as never);
    expect(malformed.elements).toEqual([]);
  });
});

describe("report export mapper", () => {
  it("maps pdf uri <-> bucket/path and normalises options", () => {
    const report: ReportExport = {
      ...base(),
      id: "r1",
      auditId: "au1",
      projectId: "p1",
      pdfUri: "supabase://report-files/owner-uuid-1/au1/r1.pdf",
      issueCount: 5,
      photoCount: 12,
      options: { ...DEFAULT_SETTINGS.defaultReportOptions, themeKey: "handover" },
    };
    const row = reportExportToRow(report, OWNER);
    expect(row.owner_id).toBe(OWNER);
    expect(row.pdf_bucket).toBe("report-files");
    expect(row.pdf_path).toBe("owner-uuid-1/au1/r1.pdf");

    const back = reportExportFromRow({ ...row, id: "r1", options: { bogus: true } } as never);
    expect(back.pdfUri).toBe("supabase://report-files/owner-uuid-1/au1/r1.pdf");
    expect(back.options).toEqual(DEFAULT_SETTINGS.defaultReportOptions);
  });
});

describe("app settings mapper", () => {
  it("maps shared settings without leaking device-local cursors into the account row", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      inspectorName: "Alex",
      companyName: "Acme",
      logoUri: "supabase://project-media/owner-uuid-1/account/logo.png",
      cloudImportCompletedAt: "2026-01-01T00:00:00.000Z",
      cloudImportCheckpoint: { projects: true, assets: false },
    };
    const row = appSettingsToRow(settings, OWNER);
    expect(row.owner_id).toBe(OWNER);
    expect(row.logo_bucket).toBe("project-media");
    expect(row.local_import_completed_at).toBeUndefined();
    expect(row.local_import_checkpoint).toBeUndefined();

    const fullRow = {
      owner_id: OWNER,
      inspector_name: "Alex",
      company_name: "Acme",
      logo_bucket: "project-media",
      logo_path: "owner-uuid-1/account/logo.png",
      report_footer_text: "",
      default_report_options: {},
      upload_wifi_only: true,
      keep_awake_while_uploading: false,
      storage_notice_dismissed_at: null,
      last_time_to_first_issue_ms: null,
      last_audit_id: null,
      last_location_id: null,
      last_assignee_id: null,
      last_priority: "medium",
      demo_seeded: false,
      local_import_completed_at: "2026-01-01T00:00:00.000Z",
      local_import_checkpoint: { projects: true, assets: false },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
      local_version: 1,
      server_version: 1,
    };
    const back = appSettingsFromRow(fullRow as never);
    expect(back.inspectorName).toBe("Alex");
    expect(back.logoUri).toBe("supabase://project-media/owner-uuid-1/account/logo.png");
    expect(back.cloudImportCompletedAt).toBeNull();
    expect(back.cloudImportCheckpoint).toBeNull();
    expect(back.cloudLastPulledAt).toBeNull();
  });

  it("falls back to the local logo URI when the row has none, and null checkpoint when absent", () => {
    const fullRow = {
      owner_id: OWNER,
      inspector_name: "",
      company_name: "",
      logo_bucket: null,
      logo_path: null,
      report_footer_text: "",
      default_report_options: {},
      upload_wifi_only: true,
      keep_awake_while_uploading: false,
      storage_notice_dismissed_at: null,
      last_time_to_first_issue_ms: null,
      last_audit_id: null,
      last_location_id: null,
      last_assignee_id: null,
      last_priority: "medium",
      demo_seeded: false,
      local_import_completed_at: null,
      local_import_checkpoint: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
      local_version: 1,
      server_version: 1,
    };
    const back = appSettingsFromRow(fullRow as never, "file:///tmp/local-logo.png");
    expect(back.logoUri).toBe("file:///tmp/local-logo.png");
    expect(back.cloudImportCheckpoint).toBeNull();
  });
});
