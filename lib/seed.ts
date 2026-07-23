/**
 * Demo seed data — one SAMPLE project with an audit and 8 issues.
 * Photos are bundled under assets/seed/ (licence-clear generated SAMPLE images)
 * and materialised through the real media pipeline (PHOTO_DIR / data URIs).
 */

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { PHOTO_DIR } from "@/lib/files";
import { processPickedPhotoWeb } from "@/lib/filesWeb";
import { newId, nowIso } from "@/lib/ids";
import { SEED_COVER, SEED_ISSUE_PHOTOS } from "@/lib/seedAssets";
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

/** ISO timestamp N days before now (keeps demo captures from looking stale). */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
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
    photo: 4,
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
    photo: 5,
  },
  {
    title: "Corridor skirting gap at level 1 lift lobby",
    description: "10mm gap between skirting and floor finish outside lift. Refit skirting and caulk.",
    status: "completed",
    priority: "low",
    location: 1,
    assignee: 0,
    photo: 6,
  },
  {
    title: "Temporary switchboard unsecured — signage non-compliant",
    description:
      "Temporary site switchboard door left open with contractor contact details exposed. Secure the door, replace non-compliant signage and re-issue the test tag. Contractor phone number has been redacted in the report copy.",
    status: "in_progress",
    priority: "high",
    location: 1,
    assignee: 2,
    photo: 7,
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

async function resolveModuleUri(moduleId: number): Promise<string | null> {
  try {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    return asset.localUri ?? asset.uri ?? null;
  } catch (e) {
    console.log("[seed] resolveModuleUri failed", e);
    return null;
  }
}

async function materializeSeedPhoto(
  moduleId: number,
  fileId: string,
): Promise<{ originalUri: string; reportUri: string; thumbUri: string; width: number; height: number } | null> {
  const sourceUri = await resolveModuleUri(moduleId);
  if (!sourceUri) return null;

  try {
    if (Platform.OS === "web") {
      const processed = await processPickedPhotoWeb(sourceUri);
      return processed;
    }

    const info = await FileSystem.getInfoAsync(PHOTO_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
    }
    const dest = `${PHOTO_DIR}seed_${fileId}.png`;
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return { originalUri: dest, reportUri: dest, thumbUri: dest, width: 1200, height: 900 };
  } catch (e) {
    console.log("[seed] materializeSeedPhoto failed", fileId, e);
    return null;
  }
}

/** Build the SAMPLE demo database. Never throws on media copy failure. */
export async function buildDemoDb(): Promise<Db> {
  const cover = await materializeSeedPhoto(SEED_COVER as number, "cover");

  const project: Project = {
    ...base(),
    name: "Sample — Harbourview Apartments Stage 2",
    reference: "HVA-ST2-2026",
    clientName: "Meridian Property Group",
    siteAddress: "18 Wharf Parade, Newcastle NSW",
    companyName: "",
    inspectorName: "Alex Carter",
    coverPhotoUri: cover?.originalUri ?? null,
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

  const today = new Date();
  const auditDate = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;

  const audit: Audit = {
    ...base(),
    projectId: project.id,
    title: "Pre-Handover Site Walk",
    auditDate,
    preparedFor: "Meridian Property Group (sample)",
    preparedBy: "Alex Carter",
    status: "draft",
    notes: "",
    defaultLocationId: locations[0]?.id ?? null,
    defaultAssigneeId: null,
    themeKey: "sitewalk",
    completedAt: null,
    reportIssuedAt: null,
  };

  const issues: Issue[] = [];
  const assets: PhotoAsset[] = [];
  const annotations: Db["annotations"] = [];

  for (let i = 0; i < SEED_ISSUES.length; i++) {
    const seed = SEED_ISSUES[i]!;
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

    const moduleId = SEED_ISSUE_PHOTOS[seed.photo] ?? SEED_ISSUE_PHOTOS[0];
    const media = await materializeSeedPhoto(moduleId as number, `issue_${i + 1}`);
    if (media) {
      const asset: PhotoAsset = {
        ...base(),
        issueId: issue.id,
        auditId: audit.id,
        projectId: project.id,
        originalUri: media.originalUri,
        reportUri: media.reportUri,
        thumbUri: media.thumbUri,
        annotatedUri: null,
        width: media.width,
        height: media.height,
        // Stagger captures over the last week so the demo feels recent, not static.
        capturedAt: daysAgoIso(Math.min(6, SEED_ISSUES.length - 1 - i)),
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
    }
  }

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
