/**
 * Report generation — builds premium, print-ready A4 HTML for expo-print.
 * Cover page → summary + hit list table → grouped item detail pages.
 */

import { BrandConfig, REPORT_THEMES } from "@/constants/config";
import { escapeHtml, formatDate, formatDateTime, issueRef } from "@/lib/format";
import { elementsToOverlaySvg } from "@/lib/annotationSvg";
import type {
  AnnotationRecord,
  Assignee,
  Audit,
  Issue,
  PhotoAsset,
  Project,
  ProjectLocation,
  ReportOptions,
  IssueStatus,
} from "@/types/models";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/types/models";

export interface ReportData {
  project: Project;
  audit: Audit;
  issues: Issue[];
  locations: ProjectLocation[];
  assignees: Assignee[];
  assets: PhotoAsset[];
  annotations: AnnotationRecord[];
  options: ReportOptions;
  /** Resolves an image URI to something embeddable (data URI or URL). */
  imageSrc: (uri: string) => string;
}

const STATUS_COLORS: Record<IssueStatus, string> = {
  open: "#DC2626",
  assigned: "#F59E0B",
  in_progress: "#0EA5E9",
  completed: "#16A34A",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#64748B",
  medium: "#F59E0B",
  high: "#DC2626",
};

function locationName(locations: ProjectLocation[], id: string | null): string {
  if (!id) return "General";
  return locations.find((l) => l.id === id)?.name ?? "General";
}

function assigneeName(assignees: Assignee[], id: string | null): string {
  if (!id) return "Unassigned";
  return assignees.find((a) => a.id === id)?.name ?? "Unassigned";
}

function statusChip(status: IssueStatus): string {
  const c = STATUS_COLORS[status];
  return `<span class="chip" style="color:${c};background:${c}14;border:1px solid ${c}40">${STATUS_LABEL[status]}</span>`;
}

function priorityChip(priority: string): string {
  const c = PRIORITY_COLORS[priority] ?? "#64748B";
  return `<span class="chip" style="color:${c};background:${c}14;border:1px solid ${c}40">${PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL] ?? priority}</span>`;
}

interface IssuePhotoHtmlArgs {
  asset: PhotoAsset;
  annotation: AnnotationRecord | undefined;
  annotated: boolean;
  imageSrc: (uri: string) => string;
  label: string;
}

function photoFigure({ asset, annotation, annotated, imageSrc, label }: IssuePhotoHtmlArgs): string {
  const src = imageSrc(asset.reportUri);
  const overlay =
    annotated && annotation && annotation.elements.length > 0
      ? elementsToOverlaySvg(annotation.elements, asset.width, asset.height)
      : "";
  return `
    <figure class="photo">
      <div class="photo-frame" style="aspect-ratio:${asset.width}/${asset.height}">
        <img src="${src}" alt=""/>
        ${overlay}
      </div>
      <figcaption>${escapeHtml(label)}</figcaption>
    </figure>`;
}

export function buildReportHtml(data: ReportData): string {
  const { project, audit, options, locations, assignees, assets, annotations, imageSrc } = data;
  const theme = REPORT_THEMES[options.themeKey] ?? REPORT_THEMES.navy;

  let issues = data.issues.filter((i) => i.includeInReport && !i.deletedAt);
  if (!options.includeCompleted) issues = issues.filter((i) => i.status !== "completed");
  issues = [...issues].sort((a, b) =>
    options.sortBy === "number" ? a.issueNumber - b.issueNumber : a.sortOrder - b.sortOrder,
  );

  const counts: Record<IssueStatus, number> = { open: 0, assigned: 0, in_progress: 0, completed: 0 };
  const priorityCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const i of issues) {
    counts[i.status] += 1;
    priorityCounts[i.priority] = (priorityCounts[i.priority] ?? 0) + 1;
  }

  const inspector = audit.preparedBy || project.inspectorName || "—";
  const companyName = project.companyName || BrandConfig.defaultCompanyName;
  const photoWidthCss =
    options.imageSize === "compact" ? "31.5%" : options.imageSize === "large" ? "100%" : "48.5%";

  /* ------------------------------- Cover page ------------------------------- */
  const logo = project.logoUri
    ? `<img class="cover-logo" src="${imageSrc(project.logoUri)}" alt=""/>`
    : `<div class="cover-mark">${escapeHtml(BrandConfig.monogram)}</div>`;

  const coverPhoto = project.coverPhotoUri
    ? `<div class="cover-photo"><img src="${imageSrc(project.coverPhotoUri)}" alt=""/></div>`
    : "";

  const cover = options.coverPage
    ? `
  <section class="page cover">
    <div class="cover-band" style="background:${theme.primary}">
      <div class="cover-band-inner">
        ${logo}
        <div class="cover-brand">
          <div class="cover-app">${escapeHtml(companyName || BrandConfig.appName)}</div>
          <div class="cover-tag">${escapeHtml(BrandConfig.reportName)}</div>
        </div>
      </div>
    </div>
    <div class="cover-body">
      <h1 style="color:${theme.heading}">${escapeHtml(audit.title || BrandConfig.reportName)}</h1>
      <div class="cover-project">${escapeHtml(project.name)}</div>
      ${project.siteAddress ? `<div class="cover-address">${escapeHtml(project.siteAddress)}</div>` : ""}
      ${coverPhoto}
      <table class="cover-meta">
        <tr><td>Prepared for</td><td>${escapeHtml(audit.preparedFor || project.clientName || "—")}</td></tr>
        <tr><td>Prepared by</td><td>${escapeHtml(inspector)}</td></tr>
        ${project.reference ? `<tr><td>Reference</td><td>${escapeHtml(project.reference)}</td></tr>` : ""}
        <tr><td>Report date</td><td>${formatDate(audit.auditDate)}</td></tr>
        <tr><td>Items recorded</td><td>${issues.length} (${counts.open + counts.assigned + counts.in_progress} outstanding · ${counts.completed} completed)</td></tr>
      </table>
    </div>
    <div class="cover-footer">
      <span>${escapeHtml(BrandConfig.reportFooter)}</span>
      <span>${formatDate(new Date().toISOString())}</span>
    </div>
  </section>`
    : "";

  /* ------------------------------ Summary page ------------------------------ */
  const hitRows = issues
    .map((i) => {
      return `<tr>
        <td class="num">${issueRef(i.issueNumber)}</td>
        <td>${escapeHtml(locationName(locations, i.locationId))}</td>
        <td class="ttl">${escapeHtml(i.title || "Untitled issue")}</td>
        <td>${escapeHtml(assigneeName(assignees, i.assigneeId))}</td>
        <td>${statusChip(i.status)}</td>
        <td>${priorityChip(i.priority)}</td>
      </tr>`;
    })
    .join("");

  const summary = options.includeSummary
    ? `
  <section class="page">
    <div class="section-head" style="border-color:${theme.primary}">
      <h2 style="color:${theme.heading}">Audit Summary</h2>
      <div class="section-sub">${escapeHtml(project.name)} · ${formatDate(audit.auditDate)}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-num" style="color:${theme.primary}">${issues.length}</div><div class="stat-lbl">Total items</div></div>
      <div class="stat"><div class="stat-num" style="color:${STATUS_COLORS.open}">${counts.open}</div><div class="stat-lbl">Open</div></div>
      <div class="stat"><div class="stat-num" style="color:${STATUS_COLORS.assigned}">${counts.assigned}</div><div class="stat-lbl">Assigned</div></div>
      <div class="stat"><div class="stat-num" style="color:${STATUS_COLORS.in_progress}">${counts.in_progress}</div><div class="stat-lbl">In progress</div></div>
      <div class="stat"><div class="stat-num" style="color:${STATUS_COLORS.completed}">${counts.completed}</div><div class="stat-lbl">Completed</div></div>
    </div>
    <div class="priority-row">
      <span class="pr-lbl">Priority breakdown:</span>
      ${priorityChip("high")} ${priorityCounts.high ?? 0}
      &nbsp; ${priorityChip("medium")} ${priorityCounts.medium ?? 0}
      &nbsp; ${priorityChip("low")} ${priorityCounts.low ?? 0}
    </div>
    <h3 class="hitlist-title" style="color:${theme.heading}">Hit List</h3>
    <table class="hitlist">
      <thead><tr style="background:${theme.primary}">
        <th>Item</th><th>Location</th><th>Issue</th><th>Assignee</th><th>Status</th><th>Priority</th>
      </tr></thead>
      <tbody>${hitRows || `<tr><td colspan="6" class="empty">No items included</td></tr>`}</tbody>
    </table>
  </section>`
    : "";

  /* ------------------------------- Item pages ------------------------------- */
  let detailHtml = "";
  if (options.includeDetails) {
    const groups = new Map<string, Issue[]>();
    for (const issue of issues) {
      const key =
        options.groupBy === "location"
          ? locationName(locations, issue.locationId)
          : options.groupBy === "assignee"
            ? assigneeName(assignees, issue.assigneeId)
            : "All Items";
      const list = groups.get(key) ?? [];
      list.push(issue);
      groups.set(key, list);
    }

    const sections = Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([groupName, groupIssues]) => {
        const cards = groupIssues
          .map((issue) => {
            const issueAssets = assets.filter((a) => a.issueId === issue.id && !a.deletedAt);
            const figures: string[] = [];
            for (const asset of issueAssets) {
              const annotation = annotations.find((an) => an.assetId === asset.id);
              const hasMarkup = !!annotation && annotation.elements.length > 0;
              if (options.includeAnnotatedPhotos && hasMarkup) {
                figures.push(
                  photoFigure({ asset, annotation, annotated: true, imageSrc, label: "Marked up" }),
                );
                if (options.includeOriginalPhotos) {
                  figures.push(
                    photoFigure({ asset, annotation, annotated: false, imageSrc, label: "Original" }),
                  );
                }
              } else if (options.includeOriginalPhotos || options.includeAnnotatedPhotos) {
                figures.push(
                  photoFigure({ asset, annotation, annotated: false, imageSrc, label: "Photo" }),
                );
              }
            }

            const metaCells: string[] = [
              `<div class="meta"><span>Location</span>${escapeHtml(locationName(locations, issue.locationId))}</div>`,
              `<div class="meta"><span>Assignee</span>${escapeHtml(assigneeName(assignees, issue.assigneeId))}</div>`,
              `<div class="meta"><span>Status</span>${statusChip(issue.status)}</div>`,
              `<div class="meta"><span>Priority</span>${priorityChip(issue.priority)}</div>`,
            ];
            if (options.includeTimestamps) {
              metaCells.push(
                `<div class="meta"><span>Recorded</span>${formatDateTime(issue.createdAt)}</div>`,
                `<div class="meta"><span>Updated</span>${formatDateTime(issue.updatedAt)}</div>`,
              );
            }

            return `
            <article class="item">
              <div class="item-head">
                <div class="item-num" style="background:${theme.primary}">${issueRef(issue.issueNumber)}</div>
                <div class="item-title">${escapeHtml(issue.title || "Untitled issue")}</div>
                ${statusChip(issue.status)}
              </div>
              <div class="item-meta">${metaCells.join("")}</div>
              ${issue.description ? `<div class="item-desc">${escapeHtml(issue.description)}</div>` : ""}
              ${figures.length > 0 ? `<div class="photos" style="--pw:${photoWidthCss}">${figures.join("")}</div>` : ""}
            </article>`;
          })
          .join("");

        return `
        <section class="group">
          <div class="group-head" style="background:${theme.primary}">
            <span>${escapeHtml(groupName)}</span><span class="group-count">${groupIssues.length} item${groupIssues.length === 1 ? "" : "s"}</span>
          </div>
          ${cards}
        </section>`;
      })
      .join("");

    detailHtml = `
  <section class="page details">
    <div class="section-head" style="border-color:${theme.primary}">
      <h2 style="color:${theme.heading}">Item Details</h2>
      <div class="section-sub">${escapeHtml(project.name)} · ${formatDate(audit.auditDate)}</div>
    </div>
    ${sections}
  </section>`;
  }

  /* ------------------------------ Signature block ------------------------------ */
  const signature = options.includeSignature
    ? `
  <section class="signoff">
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Prepared by</div>
      <div class="sig-name">${escapeHtml(inspector)}</div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Received by</div>
      <div class="sig-name">${escapeHtml(audit.preparedFor || project.clientName || "")}</div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Date</div>
      <div class="sig-name"></div>
    </div>
  </section>`
    : "";

  const pageNumberCss = options.includePageNumbers
    ? `@page { margin: 14mm 12mm 16mm 12mm; @bottom-right { content: counter(page); font-family: Helvetica; font-size: 9px; color: #8A98AC; } }`
    : `@page { margin: 14mm 12mm 16mm 12mm; }`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  ${pageNumberCss}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0E1B2E; font-size: 11px; line-height: 1.45; }
  .page { page-break-after: always; }
  .page:last-of-type { page-break-after: auto; }

  /* Cover */
  .cover { display: flex; flex-direction: column; min-height: 96vh; }
  .cover-band { border-radius: 10px; padding: 20px 24px; }
  .cover-band-inner { display: flex; align-items: center; gap: 16px; }
  .cover-mark { width: 52px; height: 52px; border-radius: 12px; background: rgba(255,255,255,0.14); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; letter-spacing: 1px; }
  .cover-logo { height: 52px; max-width: 200px; object-fit: contain; }
  .cover-app { color: #fff; font-size: 17px; font-weight: 800; letter-spacing: 0.3px; }
  .cover-tag { color: rgba(255,255,255,0.75); font-size: 11px; margin-top: 2px; text-transform: uppercase; letter-spacing: 1.6px; }
  .cover-body { padding: 44px 8px 0; flex: 1; }
  .cover-body h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.4px; }
  .cover-project { font-size: 16px; font-weight: 600; margin-top: 10px; color: #33415C; }
  .cover-address { font-size: 12px; color: #5A6B82; margin-top: 3px; }
  .cover-photo { margin-top: 22px; border-radius: 10px; overflow: hidden; max-height: 240px; }
  .cover-photo img { width: 100%; height: 240px; object-fit: cover; display: block; }
  .cover-meta { margin-top: 30px; width: 100%; border-collapse: collapse; }
  .cover-meta td { padding: 9px 2px; border-bottom: 1px solid #E3E8F0; font-size: 12px; }
  .cover-meta td:first-child { color: #8A98AC; text-transform: uppercase; font-size: 9.5px; letter-spacing: 1.2px; width: 130px; font-weight: 700; }
  .cover-meta td:last-child { font-weight: 600; }
  .cover-footer { display: flex; justify-content: space-between; padding: 16px 4px 0; color: #8A98AC; font-size: 9.5px; border-top: 1px solid #E3E8F0; margin-top: 30px; }

  /* Sections */
  .section-head { border-left: 4px solid; padding: 2px 0 2px 12px; margin-bottom: 18px; }
  .section-head h2 { font-size: 19px; font-weight: 800; letter-spacing: -0.2px; }
  .section-sub { color: #8A98AC; font-size: 10.5px; margin-top: 2px; }

  /* Summary */
  .stats { display: flex; gap: 8px; margin-bottom: 14px; }
  .stat { flex: 1; border: 1px solid #E3E8F0; border-radius: 9px; padding: 12px 8px; text-align: center; background: #FAFBFD; }
  .stat-num { font-size: 22px; font-weight: 800; }
  .stat-lbl { color: #8A98AC; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; font-weight: 700; }
  .priority-row { margin: 4px 0 18px; color: #5A6B82; font-size: 10.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pr-lbl { font-weight: 700; color: #33415C; }
  .hitlist-title { font-size: 14px; font-weight: 800; margin-bottom: 8px; }
  .hitlist { width: 100%; border-collapse: collapse; font-size: 10px; }
  .hitlist th { color: #fff; text-align: left; padding: 7px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; }
  .hitlist th:first-child { border-radius: 6px 0 0 6px; }
  .hitlist th:last-child { border-radius: 0 6px 6px 0; }
  .hitlist td { padding: 7px 8px; border-bottom: 1px solid #E9EDF3; vertical-align: top; }
  .hitlist tr:nth-child(even) td { background: #FAFBFD; }
  .hitlist .num { font-weight: 800; white-space: nowrap; }
  .hitlist .ttl { font-weight: 600; }
  .hitlist .empty { text-align: center; color: #8A98AC; padding: 18px; }

  .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; white-space: nowrap; }

  /* Item details */
  .group { margin-bottom: 18px; }
  .group-head { color: #fff; border-radius: 7px; padding: 7px 12px; font-weight: 800; font-size: 11.5px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; letter-spacing: 0.3px; }
  .group-count { font-weight: 600; font-size: 9.5px; opacity: 0.8; }
  .item { border: 1px solid #E3E8F0; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; background: #fff; }
  .item-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .item-num { color: #fff; font-weight: 800; font-size: 10px; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.5px; }
  .item-title { font-weight: 700; font-size: 13px; flex: 1; }
  .item-meta { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #EEF1F6; }
  .meta { font-size: 10px; font-weight: 600; }
  .meta span { display: block; color: #8A98AC; font-size: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 1px; }
  .item-desc { font-size: 10.5px; color: #33415C; margin-bottom: 9px; white-space: pre-wrap; }
  .photos { display: flex; flex-wrap: wrap; gap: 2.5%; }
  .photo { width: var(--pw, 48.5%); margin-bottom: 8px; }
  .photo-frame { position: relative; width: 100%; border-radius: 7px; overflow: hidden; background: #EEF1F6; }
  .photo-frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  figcaption { color: #8A98AC; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; font-weight: 700; }

  /* Signature */
  .signoff { display: flex; gap: 26px; margin-top: 26px; page-break-inside: avoid; }
  .sig-col { flex: 1; }
  .sig-line { border-bottom: 1.2px solid #33415C; height: 34px; }
  .sig-lbl { color: #8A98AC; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700; margin-top: 5px; }
  .sig-name { font-size: 11px; font-weight: 600; margin-top: 2px; }
</style>
</head>
<body>
  ${cover}
  ${summary}
  ${detailHtml}
  ${signature}
</body>
</html>`;
}
