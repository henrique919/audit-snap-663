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

/** PunchThis status palette (open / assigned / in progress / verified). */
const STATUS_COLORS: Record<IssueStatus, string> = {
  open: "#B63232",
  assigned: "#E5A016",
  in_progress: "#4C82FF",
  completed: "#147A45",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#7E8B96",
  medium: "#E5A016",
  high: "#B63232",
};

/**
 * Fixed-height photo boxes, computed here in TS — not clamped in CSS.
 *
 * A4 content box with the @page margins below is 186×267mm. Page geometry
 * must be identical for portrait and landscape photos (the old CSS
 * max-width clamp kept a portrait photo's full height, measured at +2
 * pages on a 10-item report), so every figure gets an exact mm width and
 * height: landscape fills the column width up to the box height, portrait
 * fills the box height and is centred in the fixed-width cell. The frame
 * stays exactly the photo's aspect, so annotation overlays (SVG, inset:0)
 * keep pixel alignment and the blur→redaction guarantee is untouched.
 */
/**
 * Two-column card photo sizing per imageSize. The photo occupies a fixed
 * LEFT column; the item's head/meta/description fill the space to its right
 * (the old full-width layout left the entire right half of every page
 * blank beside the photo). `colW` is the real user-facing size control —
 * bigger column = bigger photos = fewer per page; `hCap` bounds a portrait
 * photo's height so it fills the column height and centres rather than
 * running tall.
 */
export const CARD_PHOTO_SIZES: Record<string, { colW: number; hCap: number }> = {
  compact: { colW: 60, hCap: 52 },
  standard: { colW: 84, hCap: 64 },
  large: { colW: 112, hCap: 92 },
};
/** Site Walk row thumbnails: context-grade, fixed cell. */
export const ROW_THUMB = { colWmm: 34, boxHmm: 26 };

export function cardPhotoSize(imageSize: string): { colW: number; hCap: number } {
  return CARD_PHOTO_SIZES[imageSize] ?? CARD_PHOTO_SIZES.standard;
}

export function computePhotoBox(
  aspectWoverH: number,
  colWmm: number,
  boxHmm: number,
): { w: number; h: number } {
  const ar = Number.isFinite(aspectWoverH) && aspectWoverH > 0 ? aspectWoverH : 4 / 3;
  const w = Math.min(colWmm, boxHmm * ar);
  const h = w / ar;
  return { w: +w.toFixed(2), h: +h.toFixed(2) };
}

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
  /** Photo column width / fixed box height in mm — see computePhotoBox. */
  colWmm: number;
  boxHmm: number;
  /** Row thumbnails omit captions. */
  caption?: boolean;
}

function photoFigure({
  asset,
  annotation,
  annotated,
  imageSrc,
  label,
  colWmm,
  boxHmm,
  caption = true,
}: IssuePhotoHtmlArgs): string {
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
  // Exact mm box computed in TS (print-engine-proof; no CSS aspect tricks).
  // The frame matches the photo's aspect exactly, so the annotation overlay
  // (inset:0) stays pixel-aligned; portrait photos fill the box height.
  const ar = asset.width / Math.max(1, asset.height);
  const box = computePhotoBox(ar, colWmm, boxHmm);
  // Missing/unreadable files resolve to "" — keep the grey frame, skip <img>.
  const imgTag = src ? `<img src="${src}" alt=""/>` : "";
  // Dimensions go on the FRAME (its content box must be exactly the photo's
  // aspect so the inset:0 overlay stays aligned); the figure shrink-wraps as
  // a flex item, so its padding/border never distorts the frame geometry.
  // The caption is capped to the frame width so long labels can't widen the
  // figure past the photo.
  return `
    <figure class="photo">
      <div class="photo-frame" style="width:${box.w}mm;height:${box.h}mm">
        ${imgTag}
        ${overlay}
      </div>
      ${caption ? `<figcaption style="max-width:${box.w}mm">${escapeHtml(label)}</figcaption>` : ""}
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
  // Card layouts: imageSize maps to a real photo COLUMN width (mm). The
  // photo sits in a fixed left column with item text beside it — this
  // replaces the old full-width layout that blanked the right half of the
  // page, AND the single-photo 66% override that made Compact a no-op.
  const cardPhoto = cardPhotoSize(options.imageSize);
  const rowLayout = theme.itemLayout === "row";

  /* ------------------------------- Cover page ------------------------------- */
  const logoUri = project.logoUri ?? branding.logoUri;
  const logoSrc = logoUri ? imageSrc(logoUri) : "";
  const brandMarkSvg = `<svg class="cover-mark-svg" viewBox="0 0 64 64" width="34" height="34" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 20 V14 a6 6 0 0 1 6-6 h6 M44 8 h6 a6 6 0 0 1 6 6 v6 M56 44 v6 a6 6 0 0 1 -6 6 h-6 M20 56 h-6 a6 6 0 0 1 -6-6 v-6" stroke="#8B97A1" stroke-width="5" stroke-linecap="round"/><rect x="24" y="24" width="16" height="16" rx="4.5" fill="#4C82FF"/></svg>`;
  const logo = logoSrc
    ? `<img class="cover-logo" src="${logoSrc}" alt=""/>`
    : `<div class="cover-mark">${brandMarkSvg}</div>`;

  const coverPhotoSrc = project.coverPhotoUri ? imageSrc(project.coverPhotoUri) : "";
  const coverPhoto = coverPhotoSrc
    ? `<div class="cover-photo"><img src="${coverPhotoSrc}" alt=""/></div>`
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

  const statsBlock = `
    <div class="stats">
      <div class="stat" style="border-left-color:${theme.primary}"><div class="stat-num" style="color:${theme.primary}">${issues.length}</div><div class="stat-lbl">Total items</div></div>
      <div class="stat" style="border-left-color:${STATUS_COLORS.open}"><div class="stat-num" style="color:${STATUS_COLORS.open}">${counts.open}</div><div class="stat-lbl">Open</div></div>
      <div class="stat" style="border-left-color:${STATUS_COLORS.assigned}"><div class="stat-num" style="color:${STATUS_COLORS.assigned}">${counts.assigned}</div><div class="stat-lbl">Assigned</div></div>
      <div class="stat" style="border-left-color:${STATUS_COLORS.in_progress}"><div class="stat-num" style="color:${STATUS_COLORS.in_progress}">${counts.in_progress}</div><div class="stat-lbl">In progress</div></div>
      <div class="stat" style="border-left-color:${STATUS_COLORS.completed}"><div class="stat-num" style="color:${STATUS_COLORS.completed}">${counts.completed}</div><div class="stat-lbl">Completed</div></div>
    </div>`;

  const priorityRow = `
    <div class="priority-row">
      <span class="pr-lbl">Priority breakdown:</span>
      ${priorityChip("high")} ${priorityCounts.high ?? 0}
      &nbsp; ${priorityChip("medium")} ${priorityCounts.medium ?? 0}
      &nbsp; ${priorityChip("low")} ${priorityCounts.low ?? 0}
    </div>`;

  const hitlistBlock = `
    <h3 class="hitlist-title" style="color:${theme.heading}">Hit List</h3>
    <table class="hitlist">
      <thead><tr style="background:${theme.primary}">
        <th>Item</th><th>Location</th><th>Issue</th><th>Assignee</th><th>Status</th><th>Priority</th>
      </tr></thead>
      <tbody>${hitRows || `<tr><td colspan="6" class="empty">No items included</td></tr>`}</tbody>
    </table>`;

  const summaryHead = `
    <div class="section-head" style="border-color:${theme.accent}">
      <h2 style="color:${theme.heading}">Audit Summary</h2>
      <div class="section-sub">${escapeHtml(project.name)} · ${formatDate(audit.auditDate)}</div>
    </div>`;

  // Row layout flows summary + items on one page run (no dedicated summary
  // page); the header band already shows the counts strip, so skip the
  // duplicate stat cards when the band is present.
  const summary = options.includeSummary
    ? rowLayout
      ? `${options.coverPage ? summaryHead + statsBlock : ""}${priorityRow}${hitlistBlock}`
      : `
  <section class="page">
    ${summaryHead}
    ${statsBlock}
    ${priorityRow}
    ${hitlistBlock}
  </section>`
    : "";

  /* ------------------------------ Signature block ------------------------------ */
  // Defined before the item pages so card layouts can embed it at the end of
  // the details flow — a standalone signature section after a .page section
  // always landed on its own nearly-blank page.
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
            if (rowLayout) {
              // Site Walk row: 26mm context thumb + one title line + one
              // muted meta line + 2-line-clamped description. The first
              // photo (marked-up when available) carries the row; extra
              // photos surface as a count so nothing is silently hidden.
              const firstAsset = issueAssets[0];
              let thumb = "";
              if (firstAsset && (options.includeAnnotatedPhotos || options.includeOriginalPhotos)) {
                const annotation = annotations.find((an) => an.assetId === firstAsset.id);
                const hasMarkup = !!annotation && annotation.elements.length > 0;
                thumb = photoFigure({
                  asset: firstAsset,
                  annotation,
                  annotated: options.includeAnnotatedPhotos && hasMarkup,
                  imageSrc,
                  label: "",
                  colWmm: ROW_THUMB.colWmm,
                  boxHmm: ROW_THUMB.boxHmm,
                  caption: false,
                });
              }
              const metaBits = [
                locationName(locations, issue.locationId),
                assigneeName(assignees, issue.assigneeId),
                PRIORITY_LABEL[issue.priority as keyof typeof PRIORITY_LABEL] ?? issue.priority,
              ];
              if (issueAssets.length > 1) metaBits.push(`${issueAssets.length} photos`);
              return `
            <article class="item item-row" style="border-left-color:${STATUS_COLORS[issue.status]}">
              ${thumb ? `<div class="row-thumb">${thumb}</div>` : ""}
              <div class="row-body">
                <div class="row-line1">
                  <div class="item-num" style="background:${theme.primary}">${issueRef(issue.issueNumber)}</div>
                  <div class="row-title">${escapeHtml(issue.title || "Untitled issue")}</div>
                  ${statusChip(issue.status)}
                </div>
                <div class="row-meta">${metaBits.map((b) => escapeHtml(b)).join(" · ")}</div>
                ${issue.description ? `<div class="row-desc">${escapeHtml(issue.description)}</div>` : ""}
              </div>
            </article>`;
            }

            const figures: string[] = [];
            for (const asset of issueAssets) {
              const annotation = annotations.find((an) => an.assetId === asset.id);
              const hasMarkup = !!annotation && annotation.elements.length > 0;
              if (options.includeAnnotatedPhotos && hasMarkup) {
                figures.push(
                  photoFigure({ asset, annotation, annotated: true, imageSrc, label: caption("Marked up", asset), colWmm: cardPhoto.colW, boxHmm: cardPhoto.hCap }),
                );
                if (options.includeOriginalPhotos) {
                  figures.push(
                    photoFigure({ asset, annotation, annotated: false, imageSrc, label: caption("Original", asset), colWmm: cardPhoto.colW, boxHmm: cardPhoto.hCap }),
                  );
                }
              } else if (options.includeOriginalPhotos || options.includeAnnotatedPhotos) {
                figures.push(
                  photoFigure({ asset, annotation, annotated: false, imageSrc, label: caption("Photo", asset), colWmm: cardPhoto.colW, boxHmm: cardPhoto.hCap }),
                );
              }
            }

            // Status renders once (header chip) — the old duplicate Status
            // meta cell wasted a labelled cell on every item.
            const metaCells: string[] = [
              `<div class="meta"><span>Location</span>${escapeHtml(locationName(locations, issue.locationId))}</div>`,
              `<div class="meta"><span>Assignee</span>${escapeHtml(assigneeName(assignees, issue.assigneeId))}</div>`,
              `<div class="meta"><span>Priority</span>${priorityChip(issue.priority)}</div>`,
            ];
            if (options.includeTimestamps) {
              metaCells.push(
                `<div class="meta"><span>Recorded</span>${formatDateTime(issue.createdAt)}</div>`,
                `<div class="meta"><span>Updated</span>${formatDateTime(issue.updatedAt)}</div>`,
              );
            }

            // Two-column card: photo(s) in a fixed left column, item text
            // (head / meta / description) filling the space to the right —
            // no more blank right half of the page beside each photo.
            const body = `
              <div class="card-body">
                <div class="item-head">
                  <div class="item-num" style="background:${theme.primary}">${issueRef(issue.issueNumber)}</div>
                  <div class="item-title">${escapeHtml(issue.title || "Untitled issue")}</div>
                  ${statusChip(issue.status)}
                </div>
                <div class="item-meta">${metaCells.join("")}</div>
                ${issue.description ? `<div class="item-desc">${escapeHtml(issue.description)}</div>` : ""}
              </div>`;
            const media =
              figures.length > 0
                ? `<div class="card-media" style="width:${cardPhoto.colW}mm">${figures.join("")}</div>`
                : "";

            return `
            <article class="item item-card" style="border-left-color:${STATUS_COLORS[issue.status]}">
              ${media}
              ${body}
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

    detailHtml = rowLayout
      ? `
    <h3 class="hitlist-title items-title" style="color:${theme.heading}">Items</h3>
    ${sections}`
      : `
  <section class="page details">
    <div class="section-head" style="border-color:${theme.accent}">
      <h2 style="color:${theme.heading}">Item Details</h2>
      <div class="section-sub">${escapeHtml(project.name)} · ${formatDate(audit.auditDate)}</div>
    </div>
    ${sections}
    ${signature}
  </section>`;
  }

  /* --------------- Site Walk header band (row layout, no cover) --------------- */
  // A designed first-page band replaces the full cover page for field
  // reports: accent bar, brand row, title, and the counts strip.
  const headerBand =
    rowLayout && !options.coverPage
      ? `
  <div class="report-band">
    <div class="band-bar" style="background:${theme.accent}"></div>
    <div class="band-head">
      ${logo}
      <div class="cover-brand">
        <div class="cover-app" style="color:${theme.heading}">${escapeHtml(companyName || BrandConfig.appName)}</div>
        <div class="cover-tag" style="color:#57616B">${escapeHtml(BrandConfig.reportName)}</div>
      </div>
      <div class="band-date">
        <div>${formatDate(audit.auditDate)}</div>
        <div class="band-inspector">${escapeHtml(inspector)}</div>
      </div>
    </div>
    <div class="band-title" style="color:${theme.heading}">${escapeHtml(audit.title || BrandConfig.reportName)}</div>
    <div class="band-sub">${escapeHtml(project.name)}${project.siteAddress ? ` · ${escapeHtml(project.siteAddress)}` : ""}</div>
    ${statsBlock}
  </div>`
      : "";

  // TODO(wave2): footer-based page numbers. CSS Paged Media
  // `@page { @bottom-right { content: counter(page) } }` is ignored by
  // expo-print's WKWebView (iOS) and Android WebView print engines — verified
  // against Expo Print docs + WebView CSS Paged Media support matrix. Keep
  // `includePageNumbers` on ReportOptions for stored-settings compatibility
  // but never emit the unsupported CSS.
  const pageNumberCss = `@page { margin: 14mm 12mm 16mm 12mm; }`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  /* Offline fonts: no Google Fonts @import — see lib/reportFonts.ts */
  ${pageNumberCss}
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${reportFontStack.body}; color: #1C232B; font-size: ${dense ? "10.5px" : "11px"}; line-height: 1.45; }
  h1, h2, h3, .stat-num, .item-num, .cover-app, .cover-brand, .hitlist .num { font-family: ${reportFontStack.heading}; }
  .page { page-break-after: always; }
  .page:last-of-type { page-break-after: auto; }

  /* Cover — shared */
  .cover { display: flex; flex-direction: column; min-height: 96vh; }
  .cover-mark { width: 52px; height: 52px; border-radius: 12px; background: #1C232B; color: #fff; display: flex; align-items: center; justify-content: center; }
  .cover-mark-svg { display: block; }
  .cover-logo { height: 52px; max-width: 200px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px; }
  .cover-stats { display: flex; gap: 8px; margin-top: 26px; }
  .cstat { flex: 1; border: 1px solid #DDE3E8; border-top: 3px solid #1C232B; border-radius: 8px; padding: 10px 8px; background: #F8FAFB; text-align: center; }
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
  .formal-logo .cover-mark { background: #1C232B; }
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
  .compact-head .cover-mark { background: #22303C; }
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

  /* Sections — PunchThis title block: heading over a strong accent rule */
  .section-head { border-bottom: 3px solid; padding: 0 0 8px; margin-bottom: 12px; }
  .section-head h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; }
  .section-sub { color: #69747D; font-size: 10.5px; margin-top: 3px; font-weight: 600; }

  /* Summary — stat cards with status-coloured left spines */
  .stats { display: flex; gap: 8px; margin-bottom: 14px; }
  .stat { flex: 1; border: 1px solid #DDE3E8; border-left: 3px solid #1C232B; border-radius: 8px; padding: 11px 9px; background: #F2F4F6; }
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

  /* Item details — PunchThis item card with status spine */
  .group { margin-bottom: 10px; }
  .group-head { color: #fff; border-radius: 7px; padding: 6px 12px; font-weight: 800; font-size: 11px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; letter-spacing: 0.3px; font-family: ${reportFontStack.heading}; page-break-after: avoid; }
  .group-count { font-weight: 600; font-size: 9.5px; opacity: 0.8; }
  .item { border: 1px solid #DDE3E8; border-left: 5px solid #B8C0C8; border-radius: 9px; padding: ${dense ? "8px 10px" : "10px 12px"}; margin-bottom: ${dense ? "7px" : "9px"}; page-break-inside: avoid; background: #fff; }
  /* Two-column card: fixed photo column left, item body right. */
  .item-card { display: flex; gap: 12px; align-items: flex-start; }
  .card-media { flex: 0 0 auto; }
  .card-media .photo { margin-bottom: 6px; }
  .card-media .photo:last-child { margin-bottom: 0; }
  .card-body { flex: 1 1 auto; min-width: 0; }
  .item-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .item-num { color: #fff; font-weight: 800; font-size: 10px; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.5px; }
  .item-title { font-weight: 700; font-size: 13px; flex: 1; letter-spacing: -0.1px; }
  .item-meta { display: flex; flex-wrap: wrap; gap: 5px 20px; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #EDF0F3; }
  .meta { font-size: 10px; font-weight: 600; }
  .meta span { display: block; color: #69747D; font-size: 8px; text-transform: uppercase; letter-spacing: 0.45px; font-weight: 800; margin-bottom: 1px; }
  .item-desc { font-size: 10.5px; color: #283238; margin-bottom: 7px; white-space: pre-wrap; }
  .photos { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; }
  /* Figure width/frame height are exact mm values computed in TS
     (computePhotoBox) — page geometry is orientation-invariant and no CSS
     clamping is involved. The frame matches the photo's aspect exactly, so
     the annotation overlay (inset:0) stays pixel-aligned. */
  .photo { background: #fff; border: 1px solid #DDE3E8; border-radius: 8px; padding: 4px; margin-bottom: 2px; page-break-inside: avoid; max-width: 100%; }
  .photo-frame { position: relative; border-radius: 5px; overflow: hidden; background: #EDF0F3; }
  .photo-frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  figcaption { color: #69747D; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.45px; margin-top: 3px; font-weight: 800; }

  /* Site Walk row layout — punch-list rows: thumb + title + meta line */
  .item-row { display: flex; gap: 10px; padding: 7px 9px; margin-bottom: 7px; align-items: flex-start; }
  .row-thumb { width: ${ROW_THUMB.colWmm}mm; min-width: ${ROW_THUMB.colWmm}mm; display: flex; justify-content: center; }
  .row-thumb .photo { margin-bottom: 0; padding: 3px; }
  .row-body { flex: 1; min-width: 0; }
  .row-line1 { display: flex; align-items: center; gap: 8px; }
  .row-title { font-weight: 700; font-size: 10.5px; flex: 1; letter-spacing: -0.1px; }
  .row-meta { color: #57616B; font-size: 8.5px; font-weight: 600; margin-top: 3px; }
  .row-desc { font-size: 9.5px; color: #283238; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  /* Site Walk first-page header band (replaces the cover page) */
  .report-band { margin-bottom: 14px; }
  .band-bar { height: 5px; border-radius: 3px; margin-bottom: 12px; }
  .band-head { display: flex; align-items: center; gap: 12px; }
  .band-head .cover-logo, .band-head .cover-mark { height: 40px; width: 40px; }
  .band-head .cover-mark svg { width: 26px; height: 26px; }
  .band-date { margin-left: auto; text-align: right; color: #57616B; font-size: 9.5px; font-weight: 700; }
  .band-inspector { font-weight: 600; margin-top: 1px; }
  .band-title { font-size: 21px; font-weight: 800; letter-spacing: -0.4px; margin-top: 12px; font-family: ${reportFontStack.heading}; }
  .band-sub { color: #57616B; font-size: 10.5px; margin-top: 2px; font-weight: 600; }
  .report-band .stats { margin-top: 12px; margin-bottom: 0; }
  .report-band .cover-app { font-size: 14px; }
  .items-title { margin-top: 14px; }

  /* Signature */
  .signoff-title { font-size: 13px; font-weight: 800; margin-top: 18px; padding-bottom: 6px; border-bottom: 2px solid; font-family: ${reportFontStack.heading}; }
  .signoff { display: flex; gap: 26px; margin-top: 18px; page-break-inside: avoid; }
  .sig-col { flex: 1; }
  .sig-line { border-bottom: 1.2px solid #283238; height: 34px; }
  .sig-lbl { color: #69747D; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 800; margin-top: 5px; }
  .sig-name { font-size: 11px; font-weight: 600; margin-top: 2px; }

  .report-footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #DDE3E8; text-align: center; color: #69747D; font-size: 9px; letter-spacing: 0.4px; font-weight: 800; }
</style>
</head>
<body>
  ${
    rowLayout
      ? `${cover}
  <section class="page">
    ${headerBand}
    ${summary}
    ${detailHtml}
    ${signature}
  </section>`
      : `${cover}
  ${summary}
  ${detailHtml}
  ${options.includeDetails ? "" : signature}`
  }
  ${footerText ? `<div class="report-footer">${escapeHtml(footerText)}</div>` : ""}
</body>
</html>`;
}
