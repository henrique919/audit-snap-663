/**
 * Report generation — builds premium, print-ready A4 HTML for expo-print.
 * Cover page → summary + hit list table → grouped item detail pages.
 */

import { BrandConfig, REPORT_THEMES, resolveThemeKey } from "@/constants/config";
import { reportFontStack } from "@/constants/typography";
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

/** User/report branding pulled from Settings (project fields override). */
export interface ReportBranding {
  companyName: string;
  inspectorName: string;
  logoUri: string | null;
  footerText: string;
}

export interface ReportData {
  project: Project;
  audit: Audit;
  issues: Issue[];
  locations: ProjectLocation[];
  assignees: Assignee[];
  assets: PhotoAsset[];
  annotations: AnnotationRecord[];
  options: ReportOptions;
  branding: ReportBranding;
  /** Resolves an image URI to something embeddable (data URI or URL). */
  imageSrc: (uri: string) => string;
}

/** CleanRun IQ status palette (danger / warning / info / success). */
const STATUS_COLORS: Record<IssueStatus, string> = {
  open: "#B42318",
  assigned: "#C27803",
  in_progress: "#1D4ED8",
  completed: "#18A94F",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#69747D",
  medium: "#C27803",
  high: "#B42318",
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
  const elements = annotation?.elements ?? [];
  const blurEls = elements.filter((el) => el.type === "blur");
  const hasBlur = blurEls.length > 0;
  // Privacy-safe export path (verified end-to-end):
  //  1. Marked-up figure with blur → use the flattened copy whenever it
  //     exists; the live blur is burnt into its pixels at save time, so it
  //     can never leak in the PDF.
  //  2. Any figure rendered from the raw photo (an "Original" figure, or a
  //     missing flattened copy) → blur regions become OPAQUE SVG redaction
  //     blocks. Never rely on CSS filter blur — the PDF renderer is not
  //     guaranteed to apply it, and a dropped filter would leak the photo.
  const useFlattened = annotated && hasBlur && !!asset.annotatedUri;
  const src = imageSrc(useFlattened && asset.annotatedUri ? asset.annotatedUri : asset.reportUri);
  let overlay = "";
  if (!useFlattened) {
    if (annotated && elements.length > 0) {
      overlay = elementsToOverlaySvg(elements, asset.width, asset.height, { blurAsRedaction: true });
    } else if (hasBlur) {
      // Original photo still respects privacy redaction.
      overlay = elementsToOverlaySvg(blurEls, asset.width, asset.height, { blurAsRedaction: true });
    }
  }
  // padding-top ratio box instead of CSS aspect-ratio — reliable in the
  // print/PDF renderer across platforms.
  const framePad = ((asset.height / Math.max(1, asset.width)) * 100).toFixed(2);
  return `
    <figure class="photo">
      <div class="photo-frame" style="padding-top:${framePad}%">
        <img src="${src}" alt=""/>
        ${overlay}
      </div>
      <figcaption>${escapeHtml(label)}</figcaption>
    </figure>`;
}

export function buildReportHtml(data: ReportData): string {
  const { project, audit, options, locations, assignees, assets, annotations, branding, imageSrc } = data;
  const theme = REPORT_THEMES[resolveThemeKey(options.themeKey)];
  const dense = theme.density === "compact";

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

  const inspector = audit.preparedBy || project.inspectorName || branding.inspectorName || "—";
  const companyName = project.companyName || branding.companyName || BrandConfig.defaultCompanyName;
  const footerText = branding.footerText || BrandConfig.reportFooter;
  // "Standard" follows the theme's density; compact/large are explicit.
  const photoWidthCss =
    options.imageSize === "compact"
      ? "31.5%"
      : options.imageSize === "large"
        ? "100%"
        : dense
          ? "31.5%"
          : "48.5%";

  /* ------------------------------- Cover page ------------------------------- */
  const logoUri = project.logoUri ?? branding.logoUri;
  const logo = logoUri
    ? `<img class="cover-logo" src="${imageSrc(logoUri)}" alt=""/>`
    : `<div class="cover-mark">${escapeHtml(BrandConfig.monogram)}</div>`;

  const coverPhoto = project.coverPhotoUri
    ? `<div class="cover-photo"><img src="${imageSrc(project.coverPhotoUri)}" alt=""/></div>`
    : "";

  const coverMeta = `
      <table class="cover-meta">
        <tr><td>Prepared for</td><td>${escapeHtml(audit.preparedFor || project.clientName || "—")}</td></tr>
        <tr><td>Prepared by</td><td>${escapeHtml(inspector)}${companyName ? ` · ${escapeHtml(companyName)}` : ""}</td></tr>
        ${project.reference ? `<tr><td>Reference</td><td>${escapeHtml(project.reference)}</td></tr>` : ""}
        <tr><td>Report date</td><td>${formatDate(audit.auditDate)}</td></tr>
      </table>`;

  // Status summary strip — required on every cover.
  const coverStats = `
      <div class="cover-stats">
        <div class="cstat" style="border-top-color:${theme.primary}"><div class="cstat-num" style="color:${theme.primary}">${issues.length}</div><div class="cstat-lbl">Total items</div></div>
        <div class="cstat" style="border-top-color:${STATUS_COLORS.open}"><div class="cstat-num" style="color:${STATUS_COLORS.open}">${counts.open}</div><div class="cstat-lbl">Open</div></div>
        <div class="cstat" style="border-top-color:${STATUS_COLORS.assigned}"><div class="cstat-num" style="color:${STATUS_COLORS.assigned}">${counts.assigned}</div><div class="cstat-lbl">Assigned</div></div>
        <div class="cstat" style="border-top-color:${STATUS_COLORS.in_progress}"><div class="cstat-num" style="color:${STATUS_COLORS.in_progress}">${counts.in_progress}</div><div class="cstat-lbl">In progress</div></div>
        <div class="cstat" style="border-top-color:${STATUS_COLORS.completed}"><div class="cstat-num" style="color:${STATUS_COLORS.completed}">${counts.completed}</div><div class="cstat-lbl">Completed</div></div>
      </div>`;

  const coverFooter = `
    <div class="cover-footer">
      <span>${escapeHtml(footerText)}</span>
      <span>${formatDate(new Date().toISOString())}</span>
    </div>`;

  let cover = "";
  if (options.coverPage) {
    if (theme.coverVariant === "executive") {
      // Executive: full dark hero panel with kicker, big title, accent rule.
      cover = `
  <section class="page cover">
    <div class="exec-hero" style="background:${theme.primary}">
      <div class="exec-top">
        ${logo}
        <div class="cover-brand">
          <div class="cover-app">${escapeHtml(companyName || BrandConfig.appName)}</div>
          <div class="cover-tag">${escapeHtml(BrandConfig.reportName)}</div>
        </div>
      </div>
      <div class="exec-title">
        <div class="exec-kicker" style="color:${theme.accent}">${escapeHtml(BrandConfig.reportName).toUpperCase()}</div>
        <h1 class="exec-h1">${escapeHtml(audit.title || BrandConfig.reportName)}</h1>
        <div class="exec-project">${escapeHtml(project.name)}</div>
        ${project.siteAddress ? `<div class="exec-address">${escapeHtml(project.siteAddress)}</div>` : ""}
      </div>
    </div>
    <div class="exec-accent" style="background:${theme.accent}"></div>
    <div class="cover-body">
      ${coverPhoto}
      ${coverMeta}
      ${coverStats}
    </div>
    ${coverFooter}
  </section>`;
    } else if (theme.coverVariant === "formal") {
      // Handover/closeout: centred, framed, formal.
      cover = `
  <section class="page cover">
    <div class="formal-frame" style="border-color:${theme.primary}">
      <div class="formal-inner" style="border-color:${theme.accent}">
        <div class="formal-logo">${logo}</div>
        ${companyName ? `<div class="formal-company" style="color:${theme.primary}">${escapeHtml(companyName)}</div>` : ""}
        <div class="formal-kicker" style="color:${theme.accent}">${escapeHtml(BrandConfig.reportName).toUpperCase()} · CLOSEOUT</div>
        <h1 class="formal-h1" style="color:${theme.heading}">${escapeHtml(audit.title || BrandConfig.reportName)}</h1>
        <div class="formal-rule" style="background:${theme.accent}"></div>
        <div class="formal-project">${escapeHtml(project.name)}</div>
        ${project.siteAddress ? `<div class="formal-address">${escapeHtml(project.siteAddress)}</div>` : ""}
        ${coverPhoto}
        ${coverMeta}
        ${coverStats}
      </div>
    </div>
    ${coverFooter}
  </section>`;
    } else {
      // Site Walk: minimal, fast — thin accent bar and a tight title block.
      cover = `
  <section class="page cover cover-compact">
    <div class="compact-bar" style="background:${theme.accent}"></div>
    <div class="compact-head">
      ${logo}
      <div class="cover-brand">
        <div class="cover-app" style="color:${theme.heading}">${escapeHtml(companyName || BrandConfig.appName)}</div>
        <div class="cover-tag" style="color:#69747D">${escapeHtml(BrandConfig.reportName)}</div>
      </div>
    </div>
    <div class="cover-body compact-body">
      <h1 style="color:${theme.heading}">${escapeHtml(audit.title || BrandConfig.reportName)}</h1>
      <div class="cover-rule" style="background:${theme.accent}"></div>
      <div class="cover-project">${escapeHtml(project.name)}</div>
      ${project.siteAddress ? `<div class="cover-address">${escapeHtml(project.siteAddress)}</div>` : ""}
      ${coverMeta}
      ${coverStats}
    </div>
    ${coverFooter}
  </section>`;
    }
  }

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
    <div class="section-head" style="border-color:${theme.accent}">
      <h2 style="color:${theme.heading}">Audit Summary</h2>
      <div class="section-sub">${escapeHtml(project.name)} · ${formatDate(audit.auditDate)}</div>
    </div>
    <div class="stats">
      <div class="stat" style="border-left-color:${theme.primary}"><div class="stat-num" style="color:${theme.primary}">${issues.length}</div><div class="stat-lbl">Total items</div></div>
      <div class="stat" style="border-left-color:${STATUS_COLORS.open}"><div class="stat-num" style="color:${STATUS_COLORS.open}">${counts.open}</div><div class="stat-lbl">Open</div></div>
      <div class="stat" style="border-left-color:${STATUS_COLORS.assigned}"><div class="stat-num" style="color:${STATUS_COLORS.assigned}">${counts.assigned}</div><div class="stat-lbl">Assigned</div></div>
      <div class="stat" style="border-left-color:${STATUS_COLORS.in_progress}"><div class="stat-num" style="color:${STATUS_COLORS.in_progress}">${counts.in_progress}</div><div class="stat-lbl">In progress</div></div>
      <div class="stat" style="border-left-color:${STATUS_COLORS.completed}"><div class="stat-num" style="color:${STATUS_COLORS.completed}">${counts.completed}</div><div class="stat-lbl">Completed</div></div>
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
            // Caption reflects report options: location and capture timestamp.
            const caption = (base: string, asset: PhotoAsset): string => {
              const bits = [base];
              if (options.includePhotoLocations) bits.push(locationName(locations, issue.locationId));
              if (options.includeTimestamps) bits.push(formatDateTime(asset.capturedAt));
              return bits.join(" \u00B7 ");
            };
            const figures: string[] = [];
            for (const asset of issueAssets) {
              const annotation = annotations.find((an) => an.assetId === asset.id);
              const hasMarkup = !!annotation && annotation.elements.length > 0;
              if (options.includeAnnotatedPhotos && hasMarkup) {
                figures.push(
                  photoFigure({ asset, annotation, annotated: true, imageSrc, label: caption("Marked up", asset) }),
                );
                if (options.includeOriginalPhotos) {
                  figures.push(
                    photoFigure({ asset, annotation, annotated: false, imageSrc, label: caption("Original", asset) }),
                  );
                }
              } else if (options.includeOriginalPhotos || options.includeAnnotatedPhotos) {
                figures.push(
                  photoFigure({ asset, annotation, annotated: false, imageSrc, label: caption("Photo", asset) }),
                );
              }
            }

            // A single photo gets a larger layout so the markup stays readable.
            const itemPhotoWidth =
              figures.length === 1 && options.imageSize !== "large" ? "66%" : photoWidthCss;

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
            <article class="item" style="border-left-color:${STATUS_COLORS[issue.status]}">
              <div class="item-head">
                <div class="item-num" style="background:${theme.primary}">${issueRef(issue.issueNumber)}</div>
                <div class="item-title">${escapeHtml(issue.title || "Untitled issue")}</div>
                ${statusChip(issue.status)}
              </div>
              <div class="item-meta">${metaCells.join("")}</div>
              ${issue.description ? `<div class="item-desc">${escapeHtml(issue.description)}</div>` : ""}
              ${figures.length > 0 ? `<div class="photos" style="--pw:${itemPhotoWidth}">${figures.join("")}</div>` : ""}
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
    <div class="section-head" style="border-color:${theme.accent}">
      <h2 style="color:${theme.heading}">Item Details</h2>
      <div class="section-sub">${escapeHtml(project.name)} · ${formatDate(audit.auditDate)}</div>
    </div>
    ${sections}
  </section>`;
  }

  /* ------------------------------ Signature block ------------------------------ */
  const signature = options.includeSignature
    ? `
  ${theme.coverVariant === "formal" ? `<div class="signoff-title" style="color:${theme.heading};border-color:${theme.accent}">Closeout sign-off</div>` : ""}
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
    ? `@page { margin: 14mm 12mm 16mm 12mm; @bottom-right { content: counter(page); font-family: Helvetica; font-size: 9px; color: #96A0A9; } }`
    : `@page { margin: 14mm 12mm 16mm 12mm; }`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');
  ${pageNumberCss}
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${reportFontStack.body}; color: #161A1D; font-size: ${dense ? "10.5px" : "11px"}; line-height: 1.45; }
  h1, h2, h3, .stat-num, .item-num, .cover-app, .cover-brand, .hitlist .num { font-family: ${reportFontStack.heading}; }
  .page { page-break-after: always; }
  .page:last-of-type { page-break-after: auto; }

  /* Cover — shared */
  .cover { display: flex; flex-direction: column; min-height: 96vh; }
  .cover-mark { width: 52px; height: 52px; border-radius: 12px; background: rgba(255,255,255,0.14); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; letter-spacing: 1px; }
  .cover-logo { height: 52px; max-width: 200px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px; }
  .cover-stats { display: flex; gap: 8px; margin-top: 26px; }
  .cstat { flex: 1; border: 1px solid #DDE3E8; border-top: 3px solid #161A1D; border-radius: 8px; padding: 10px 8px; background: #F8FAFB; text-align: center; }
  .cstat-num { font-size: 21px; font-weight: 800; line-height: 1; font-family: ${reportFontStack.heading}; }
  .cstat-lbl { color: #69747D; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 4px; font-weight: 800; }

  /* Executive cover */
  .exec-hero { border-radius: 12px; padding: 26px 28px 34px; display: flex; flex-direction: column; gap: 56px; }
  .exec-top { display: flex; align-items: center; gap: 16px; }
  .exec-kicker { font-size: 10px; font-weight: 800; letter-spacing: 2.4px; margin-bottom: 10px; font-family: ${reportFontStack.heading}; }
  .exec-h1 { color: #fff; font-size: 38px; font-weight: 800; letter-spacing: -0.6px; line-height: 1.08; }
  .exec-project { color: rgba(255,255,255,0.85); font-size: 15px; font-weight: 600; margin-top: 12px; }
  .exec-address { color: rgba(255,255,255,0.6); font-size: 11.5px; margin-top: 3px; }
  .exec-accent { height: 5px; border-radius: 3px; margin: 10px 2px 0; }

  /* Formal / handover cover */
  .formal-frame { border: 1.6px solid; border-radius: 4px; padding: 7px; flex: 1; display: flex; }
  .formal-inner { border: 1px solid; border-radius: 2px; flex: 1; padding: 44px 36px; text-align: center; }
  .formal-logo { display: flex; justify-content: center; margin-bottom: 14px; }
  .formal-logo .cover-mark { background: #14342B; }
  .formal-company { font-size: 13px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; margin-bottom: 30px; font-family: ${reportFontStack.heading}; }
  .formal-kicker { font-size: 9.5px; font-weight: 800; letter-spacing: 2.6px; margin-bottom: 12px; }
  .formal-h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.14; }
  .formal-rule { width: 72px; height: 3px; border-radius: 2px; margin: 16px auto; }
  .formal-project { font-size: 15px; font-weight: 600; color: #33415C; }
  .formal-address { font-size: 11.5px; color: #5A6B82; margin-top: 3px; }
  .formal-inner .cover-meta { margin-top: 34px; text-align: left; }
  .formal-inner .cover-photo { margin-top: 24px; }

  /* Compact / site walk cover */
  .compact-bar { height: 6px; border-radius: 3px; margin-bottom: 18px; }
  .compact-head { display: flex; align-items: center; gap: 14px; }
  .compact-head .cover-mark { background: #1F2937; }
  .compact-body { padding-top: 30px; }
  .cover-app { color: #fff; font-size: 17px; font-weight: 800; letter-spacing: 0.3px; }
  .cover-tag { color: rgba(255,255,255,0.75); font-size: 11px; margin-top: 2px; text-transform: uppercase; letter-spacing: 1.6px; }
  .cover-body { padding: 26px 8px 0; flex: 1; }
  .cover-body h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.12; }
  .cover-rule { width: 64px; height: 4px; border-radius: 2px; margin: 14px 0 4px; }
  .cover-project { font-size: 16px; font-weight: 600; margin-top: 10px; color: #33415C; }
  .cover-address { font-size: 12px; color: #5A6B82; margin-top: 3px; }
  .cover-photo { margin-top: 22px; border-radius: 10px; overflow: hidden; max-height: 240px; }
  .cover-photo img { width: 100%; height: 240px; object-fit: cover; display: block; }
  .cover-meta { margin-top: 24px; width: 100%; border-collapse: collapse; }
  .cover-meta td { padding: 9px 2px; border-bottom: 1px solid #DDE3E8; font-size: 12px; }
  .cover-meta td:first-child { color: #69747D; text-transform: uppercase; font-size: 9.5px; letter-spacing: 1.2px; width: 130px; font-weight: 800; }
  .cover-meta td:last-child { font-weight: 600; }
  .cover-footer { display: flex; justify-content: space-between; padding: 16px 4px 0; color: #69747D; font-size: 9.5px; letter-spacing: 0.4px; font-weight: 700; border-top: 1px solid #DDE3E8; margin-top: 30px; }

  /* Sections — CleanRun IQ title block: heading over a strong accent rule */
  .section-head { border-bottom: 3px solid; padding: 0 0 8px; margin-bottom: 18px; }
  .section-head h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; }
  .section-sub { color: #69747D; font-size: 10.5px; margin-top: 3px; font-weight: 600; }

  /* Summary — stat cards with status-coloured left spines */
  .stats { display: flex; gap: 8px; margin-bottom: 14px; }
  .stat { flex: 1; border: 1px solid #DDE3E8; border-left: 3px solid #161A1D; border-radius: 8px; padding: 11px 9px; background: #F4F6F8; }
  .stat-num { font-size: 22px; font-weight: 800; line-height: 1; }
  .stat-lbl { color: #69747D; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; font-weight: 800; }
  .priority-row { margin: 4px 0 18px; color: #69747D; font-size: 10.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pr-lbl { font-weight: 700; color: #283238; }
  .hitlist-title { font-size: 14px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.2px; }
  .hitlist { width: 100%; border-collapse: collapse; font-size: 10px; }
  .hitlist thead { display: table-header-group; }
  .hitlist tr { page-break-inside: avoid; }
  .hitlist th { color: #fff; text-align: left; padding: 7px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 800; }
  .hitlist th:first-child { border-radius: 6px 0 0 6px; }
  .hitlist th:last-child { border-radius: 0 6px 6px 0; }
  .hitlist td { padding: 7px 8px; border-bottom: 1px solid #E7ECF0; vertical-align: top; }
  .hitlist tr:nth-child(even) td { background: #F8FAFB; }
  .hitlist .num { font-weight: 800; white-space: nowrap; }
  .hitlist .ttl { font-weight: 600; }
  .hitlist .empty { text-align: center; color: #96A0A9; padding: 18px; }

  .chip { display: inline-block; padding: 2.5px 8px; border-radius: 999px; font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }

  /* Item details — CleanRun IQ item card with status spine */
  .group { margin-bottom: 18px; }
  .group-head { color: #fff; border-radius: 7px; padding: 7px 12px; font-weight: 800; font-size: 11.5px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; letter-spacing: 0.3px; font-family: ${reportFontStack.heading}; page-break-after: avoid; }
  .group-count { font-weight: 600; font-size: 9.5px; opacity: 0.8; }
  .item { border: 1px solid #DDE3E8; border-left: 5px solid #B8C0C8; border-radius: 9px; padding: ${dense ? "9px 11px" : "12px 14px"}; margin-bottom: ${dense ? "9px" : "12px"}; page-break-inside: avoid; background: #fff; }
  .item-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .item-num { color: #fff; font-weight: 800; font-size: 10px; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.5px; }
  .item-title { font-weight: 700; font-size: 13px; flex: 1; letter-spacing: -0.1px; }
  .item-meta { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #EDF0F3; }
  .meta { font-size: 10px; font-weight: 600; }
  .meta span { display: block; color: #69747D; font-size: 8px; text-transform: uppercase; letter-spacing: 0.45px; font-weight: 800; margin-bottom: 1px; }
  .item-desc { font-size: 10.5px; color: #283238; margin-bottom: 9px; white-space: pre-wrap; }
  .photos { display: flex; flex-wrap: wrap; gap: 2.5%; }
  .photo { width: var(--pw, 48.5%); margin-bottom: 8px; background: #fff; border: 1px solid #DDE3E8; border-radius: 8px; padding: 5px; page-break-inside: avoid; }
  .photo-frame { position: relative; width: 100%; height: 0; border-radius: 5px; overflow: hidden; background: #EDF0F3; }
  .photo-frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  figcaption { color: #69747D; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.45px; margin-top: 4px; font-weight: 800; }

  /* Signature */
  .signoff-title { font-size: 13px; font-weight: 800; margin-top: 26px; padding-bottom: 6px; border-bottom: 2px solid; font-family: ${reportFontStack.heading}; }
  .signoff { display: flex; gap: 26px; margin-top: 26px; page-break-inside: avoid; }
  .sig-col { flex: 1; }
  .sig-line { border-bottom: 1.2px solid #283238; height: 34px; }
  .sig-lbl { color: #69747D; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 800; margin-top: 5px; }
  .sig-name { font-size: 11px; font-weight: 600; margin-top: 2px; }

  .report-footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #DDE3E8; text-align: center; color: #69747D; font-size: 9px; letter-spacing: 0.4px; font-weight: 800; }
</style>
</head>
<body>
  ${cover}
  ${summary}
  ${detailHtml}
  ${signature}
  ${footerText ? `<div class="report-footer">${escapeHtml(footerText)}</div>` : ""}
</body>
</html>`;
}
