/**
 * Demo seed data — one realistic project with an audit and 8 issues across
 * multiple locations/statuses, including sample annotations. Issue 8 is a
 * "markup QA" sample demonstrating every annotation tool (arrow, circle,
 * box, pen, text label, numbered callouts and a privacy blur) so the markup
 * studio and report redaction path can be reviewed without manual setup.
 *
 * Easy to remove: delete this file and the single call in providers/AppStore.
 * Users can also wipe it from Settings → Reset demo data.
 */

import { newId, nowIso } from "@/lib/ids";
import type { Db } from "@/lib/store";
import type {
  AnnotationElement,
  Assignee,
  Audit,
  BaseRecord,
  Issue,
  IssuePriority,
  IssueStatus,
  PhotoAsset,
  Project,
  ProjectLocation,
} from "@/types/models";

function base(): BaseRecord {
  const now = nowIso();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: "local_only",
    localVersion: 1,
    serverVersion: 1,
  };
}

const DEMO_PHOTOS: string[] = [
  "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80",
  "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1600&q=80",
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1600&q=80",
  "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1600&q=80",
  "https://picsum.photos/seed/caiq-render/1600/1200",
  "https://picsum.photos/seed/caiq-corridor/1600/1200",
  "https://picsum.photos/seed/caiq-roof/1600/1200",
  "https://picsum.photos/seed/caiq-carpark/1600/1200",
];

const COVER_PHOTO = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&q=80";

interface SeedIssue {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  location: number;
  assignee: number | null;
  photo: number;
  annotations?: AnnotationElement[];
}

const SEED_ISSUES: SeedIssue[] = [
  {
    title: "Paint scuffing to lobby feature wall",
    description:
      "Multiple scuff marks and roller lines visible on the feature wall near the concierge desk. Requires prep and full recoat to match approved sample.",
    status: "open",
    priority: "medium",
    location: 0,
    assignee: 0,
    photo: 0,
    annotations: [
      { id: "ann_001", type: "ellipse", cx: 0.42, cy: 0.38, rx: 0.16, ry: 0.12, stroke: "#E53935", strokeWidth: 8 },
      { id: "ann_002", type: "arrow", x1: 0.72, y1: 0.7, x2: 0.52, y2: 0.46, stroke: "#E53935", strokeWidth: 8 },
      { id: "ann_003", type: "callout", cx: 0.78, cy: 0.74, number: 1, color: "#E53935", size: 64 },
    ],
  },
  {
    title: "Sealant missed at shower screen junction",
    description:
      "Silicone bead incomplete along shower screen to tile junction. Waterproofing risk — complete before wet area sign-off.",
    status: "assigned",
    priority: "high",
    location: 2,
    assignee: 1,
    photo: 1,
    annotations: [
      { id: "ann_004", type: "rect", x: 0.28, y: 0.5, width: 0.4, height: 0.2, stroke: "#F59E0B", strokeWidth: 8 },
      { id: "ann_005", type: "text", x: 0.28, y: 0.46, text: "Missing sealant", color: "#F59E0B", fontSize: 42 },
    ],
  },
  {
    title: "Exposed cabling above ceiling grid",
    description:
      "Data cabling not supported and resting on ceiling tiles outside comms cupboard. Re-run on catenary and clip to standard.",
    status: "in_progress",
    priority: "high",
    location: 1,
    assignee: 2,
    photo: 2,
  },
  {
    title: "Door hardware loose — Unit 104 entry",
    description: "Lever handle loose on entry door. Tighten fixings and check latch alignment.",
    status: "open",
    priority: "low",
    location: 2,
    assignee: null,
    photo: 3,
  },
  {
    title: "Membrane blistering at roof terrace",
    description:
      "Two blisters in waterproofing membrane near planter box. Cut out and patch per manufacturer detail, then flood test.",
    status: "open",
    priority: "high",
    location: 3,
    assignee: 1,
    photo: 6,
    annotations: [
      { id: "ann_006", type: "ellipse", cx: 0.55, cy: 0.55, rx: 0.14, ry: 0.1, stroke: "#E53935", strokeWidth: 8 },
      { id: "ann_007", type: "callout", cx: 0.3, cy: 0.3, number: 1, color: "#0EA5E9", size: 64 },
    ],
  },
  {
    title: "Line marking incomplete — visitor bays",
    description: "Visitor bay numbering not painted. Complete line marking per car park layout drawing.",
    status: "completed",
    priority: "medium",
    location: 4,
    assignee: null,
    photo: 7,
  },
  {
    title: "Corridor skirting gap at level 1 lift lobby",
    description: "10mm gap between skirting and floor finish outside lift. Refit skirting and caulk.",
    status: "completed",
    priority: "low",
    location: 1,
    assignee: 0,
    photo: 5,
  },
  {
    title: "Temporary switchboard unsecured — signage non-compliant",
    description:
      "Temporary site switchboard door left open with contractor contact details exposed. Secure the door, replace non-compliant signage and re-issue the test tag. Contractor phone number has been redacted in the report copy.",
    status: "in_progress",
    priority: "high",
    location: 1,
    assignee: 2,
    photo: 4,
    annotations: [
      { id: "ann_100", type: "rect", x: 0.1, y: 0.16, width: 0.36, height: 0.34, stroke: "#E53935", strokeWidth: 8 },
      { id: "ann_101", type: "ellipse", cx: 0.7, cy: 0.28, rx: 0.12, ry: 0.09, stroke: "#0EA5E9", strokeWidth: 8 },
      { id: "ann_102", type: "arrow", x1: 0.58, y1: 0.74, x2: 0.4, y2: 0.48, stroke: "#E53935", strokeWidth: 8 },
      {
        id: "ann_103",
        type: "pen",
        points: [
          { x: 0.14, y: 0.6 },
          { x: 0.17, y: 0.64 },
          { x: 0.21, y: 0.6 },
          { x: 0.25, y: 0.65 },
          { x: 0.29, y: 0.61 },
        ],
        stroke: "#F59E0B",
        strokeWidth: 8,
      },
      { id: "ann_104", type: "text", x: 0.5, y: 0.8, text: "Door left open", color: "#E53935", fontSize: 42, bg: true },
      { id: "ann_105", type: "callout", cx: 0.16, cy: 0.1, number: 1, color: "#E53935", size: 64 },
      { id: "ann_106", type: "callout", cx: 0.85, cy: 0.14, number: 2, color: "#0EA5E9", size: 64 },
      { id: "ann_107", type: "blur", x: 0.56, y: 0.54, width: 0.26, height: 0.12, intensity: 18 },
    ],
  },
];

export function buildDemoDb(): Db {
  const project: Project = {
    ...base(),
    name: "Harbourview Apartments — Stage 2",
    reference: "HVA-ST2-2026",
    clientName: "Meridian Property Group",
    siteAddress: "18 Wharf Parade, Newcastle NSW",
    companyName: "",
    inspectorName: "Alex Carter",
    coverPhotoUri: COVER_PHOTO,
    logoUri: null,
    status: "active",
  };

  const locationNames = ["Lobby", "Level 1 Corridor", "Unit 104", "Roof Terrace", "Car Park"];
  const locations: ProjectLocation[] = locationNames.map((name, i) => ({
    ...base(),
    projectId: project.id,
    name,
    sortOrder: i,
  }));

  const assignees: Assignee[] = [
    { ...base(), name: "BuildRight Painting", company: "BuildRight Pty Ltd", email: "", phone: "", trade: "Painting" },
    { ...base(), name: "AquaSeal Waterproofing", company: "AquaSeal", email: "", phone: "", trade: "Waterproofing" },
    { ...base(), name: "Sparks Electrical", company: "Sparks Group", email: "", phone: "", trade: "Electrical" },
  ];

  const audit: Audit = {
    ...base(),
    projectId: project.id,
    title: "Pre-Handover Site Walk",
    auditDate: new Date().toISOString().slice(0, 10),
    preparedFor: "Meridian Property Group",
    preparedBy: "Alex Carter",
    status: "draft",
    notes: "",
    defaultLocationId: locations[0]?.id ?? null,
    defaultAssigneeId: null,
    themeKey: "navy",
    completedAt: null,
    reportIssuedAt: null,
  };

  const issues: Issue[] = [];
  const assets: PhotoAsset[] = [];
  const annotations: Db["annotations"] = [];

  SEED_ISSUES.forEach((seed, i) => {
    const issue: Issue = {
      ...base(),
      auditId: audit.id,
      projectId: project.id,
      locationId: locations[seed.location]?.id ?? null,
      issueNumber: i + 1,
      title: seed.title,
      description: seed.description,
      status: seed.status,
      priority: seed.priority,
      assigneeId: seed.assignee !== null ? (assignees[seed.assignee]?.id ?? null) : null,
      includeInReport: true,
      sortOrder: i,
    };
    issues.push(issue);

    const photoUrl = DEMO_PHOTOS[seed.photo] ?? DEMO_PHOTOS[0];
    const asset: PhotoAsset = {
      ...base(),
      issueId: issue.id,
      auditId: audit.id,
      projectId: project.id,
      originalUri: photoUrl,
      reportUri: photoUrl,
      thumbUri: photoUrl.replace("w=1600", "w=500"),
      annotatedUri: null,
      width: 1600,
      height: 1200,
      capturedAt: nowIso(),
    };
    assets.push(asset);

    if (seed.annotations && seed.annotations.length > 0) {
      annotations.push({
        ...base(),
        assetId: asset.id,
        issueId: issue.id,
        elements: seed.annotations,
        toolsetVersion: 1,
      });
    }
  });

  return {
    projects: [project],
    locations,
    assignees,
    audits: [audit],
    issues,
    assets,
    annotations,
    reports: [],
    outbox: [],
  };
}
