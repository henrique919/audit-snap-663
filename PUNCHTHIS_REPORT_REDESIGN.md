# PunchThis Report Redesign — Assessment & Build Plan

**Date:** 24 July 2026 · **Scope:** `expo/lib/report.ts` and the report builder/preview stack
**Method:** every number below was measured from real generated output — the app's own
web export path (report builder → preview → generate) driven by script against the
production build at the current branch head, rendered to true A4 PDF via Chromium, pages
counted with pdf-lib. Nothing in this document is estimated from reading code alone.

---

## 1. Assessment — why reports are not commercially viable today

### Measured output (current engine, default options)

| Scenario | Items | Pages | PDF size | Items per detail page |
|---|---|---|---|---|
| Site Walk preset, default | 10 | **11** | 1.05 MB | ~1.1 |
| Client preset, default | 10 | **11** | 1.23 MB | ~1.1 |
| Handover preset, default | 10 | **11** | 1.24 MB | ~1.1 |
| Site Walk, **Image size = Compact** | 10 | **11** (byte-identical PDF) | 1.05 MB | ~1.1 |
| Client, Image size = Large | 10 | 13 | 1.24 MB | ~0.9 |
| Site Walk, **portrait photos** (real-world mix) | 10 | **13** | 1.05 MB | ~0.9 |
| Site Walk, default | 25 | 20 | 1.23 MB | ~1.4 |
| Site Walk, default | 50 | 35 | 1.53 MB | ~1.5 |

The operator's complaint ("~2 oversized photo items per page, 10 items becomes 10–15
pages") is confirmed and slightly understated: measured density on the item-detail pages
is **1.1 items/page** with landscape photos and **0.9 items/page** with portrait photos —
and real inspection photos are overwhelmingly portrait (5 of the 6 operator-supplied site
photos are portrait phone shots).

### Root causes (all verified in code + output)

1. **The single-photo override defeats every density control.**
   `lib/report.ts:366-367`:
   ```ts
   const itemPhotoWidth =
     figures.length === 1 && options.imageSize !== "large" ? "66%" : photoWidthCss;
   ```
   An item with exactly one photo gets a 66%-width figure (≈123mm wide, height-capped at
   118mm) **no matter what** — Site Walk's "dense" 31.5% width and the user-facing
   "Image size: Compact" option are both ignored. Since the flagship Quick Walk flow
   produces exactly one photo per item, virtually every real item hits this branch.
   Proof: the Compact run above produced a *byte-identical* PDF to the default run.
   **"Image size: Compact" is currently a no-op for real-world reports.**

2. **Every item card is one indivisible block.** `.item { page-break-inside: avoid }`
   (`report.ts:554`) on cards that are ~140–160mm tall means a card that doesn't fit the
   remaining page space is pushed whole to the next page, leaving up to half a page of
   dead white space. 1.1 items/page is the arithmetic consequence: 267mm of usable
   height ÷ ~150mm cards, with push-downs.

3. **The three "report types" are one layout wearing three covers.**
   `selectPreset` (`app/audit/[id]/report.tsx:53`) writes only `themeKey`. In
   `buildReportHtml` the theme changes cover markup, colors, base font (11px vs 10.5px)
   and card padding — nothing structural. Measured: all three presets produce identical
   page counts (11/11/11). There is no per-type information hierarchy today.

4. **Portrait photos make it worse, not just different.** The LP-24 height cap correctly
   stops a portrait photo filling a page, by narrowing the frame (`max-width:
   calc(var(--mh) * var(--ar))`) — but the frame keeps the full 118mm *height*, so a
   portrait card is ~25mm taller than a landscape one. Measured: +2 pages on a 10-item
   report. Orientation currently changes document length by ~18%.

5. **Per-item chrome is heavy.** The status chip renders twice per item (header row and
   meta row); the meta strip carries up to six labelled cells; description, borders and
   caption rows add ~30mm of non-photo chrome per item even in the "dense" theme.

6. **What is *not* broken** (do not spend effort here):
   - **File size is fine.** 1.0–1.5MB PDFs at 10–50 items; the 1800px/q0.72 capture
     re-encode (`lib/filesWeb.ts:25-26`) is the right resolution ceiling for print.
   - **The hit-list table** (`report.ts:307-312`) is already excellent: 10px rows,
     repeating `<thead>`, row-level break protection. It should become the backbone of
     the Site Walk type, not be rebuilt.
   - **No distortion**: aspect-true padding-top frames mean nothing is stretched; the
     blur→redaction privacy path is solid and must be preserved exactly.
   - Fonts are system-stack (no embed bloat); images embed once per unique URI.

---

## 2. Recommended structure per report type

One HTML engine, one theme system — but three real **item layouts** selected per type
(new `itemLayout` field on `REPORT_THEMES`), with density targets that follow each
type's job on site.

### Site Walk (`sitewalk`) — "read it on a phone in a ute, act on it today"
| Section | Content |
|---|---|
| Header band (no cover page) | Accent bar, project + audit title, date, inspector, counts strip — ~45mm, first page only |
| Hit list table | Existing table, unchanged |
| Item rows (`itemLayout: "row"`) | 36mm thumbnail + single title line + one muted meta line + 2-line-clamped description |
| No signature by default | Toggleable |

**Target: 5–6 items/page; a 10-item walk = 2–3 pages total.**

### Client (`executive`) — "polished, scannable, presentation-ready"
| Section | Content |
|---|---|
| Executive cover | Keep as-is (it is genuinely good) |
| Summary + hit list | Keep |
| Item cards (`itemLayout: "card"`) | Two-column: fixed 58mm-tall photo box left, title/status/meta grid/description right. One status chip. No Recorded/Updated timestamps (client noise) |
| Signature | Keep |

**Target: 3 items/page on detail pages; a 10-item client report ≈ 6 pages.**

### Handover (`handover`) — "complete evidence, formal record, sign-off"
| Section | Content |
|---|---|
| Formal cover | Keep |
| Summary + hit list | Keep |
| Evidence blocks (`itemLayout: "evidence"`) | Full meta incl. Recorded/Updated, description, then marked-up + original photo pair side-by-side in fixed 63mm boxes |
| Optional photo appendix | Full-size photos 4-per-page, referenced by item number (Detailed mode) |
| Closeout sign-off | Keep, guaranteed same-page block |

**Target: 2–3 items/page; a 10-item handover ≈ 7–8 pages with complete evidence.**

---

## 3. Item layouts, image sizes, page-density targets

Usable A4 content box with current margins (`@page: 14mm 12mm 16mm`): **186 × 267mm**.

| Layout | Photo box (fixed) | Item height budget | Items/page |
|---|---|---|---|
| `row` (Site Walk) | 36 × 27mm thumb, contain | ≤ 42mm | **5–6** |
| `card` (Client) | 84 × 58mm, contain | ≤ 80mm | **3** |
| `evidence` (Handover) | 2 × (84 × 63mm) pair | ≤ 105mm | **2–3** |
| appendix page (optional) | 88 × 118mm cells | 4 photos/page | — |

**The one structural rule that makes all of this work: photo boxes get a fixed height,
computed in TypeScript at build time.** `buildReportHtml` already knows every asset's
width/height (it computes `framePad` and `--ar` today). Replace the CSS clamp dance with
an exact box:

```ts
// colWidthMm = layout's photo column width; boxHmm = layout's fixed box height
const drawW = Math.min(colWidthMm, boxHmm * ar);
const drawH = drawW / ar;                    // ≤ boxHmm by construction
// emit: <div class="photo-frame" style="width:${drawW}mm;height:${drawH}mm">
```

- Landscape fills the width, portrait fills the height and is **letterboxed on the
  neutral `#EDF0F3` ground, centred** — same vertical rhythm either way. Orientation no
  longer changes page count (today: +2 pages).
- The annotation overlay SVG keeps pixel-perfect alignment because the frame is still
  exactly the photo's aspect — the fix moves the "fit" decision from CSS `max-width`
  into TS, it does not change the overlay contract, and the blur/redaction path is
  untouched.
- No CSS `aspect-ratio`, no `vh`, no tricks WKWebView/Android WebView print can miss —
  plain `width`/`height` in mm.

**Readability floor for annotated photos:** 55mm box height ≈ 620px of a 1800px source
at 260+ dpi effective — arrows/boxes/text markup made in the studio remain clearly
legible (markup strokes are drawn relative to image size and the overlay is vector SVG
in the PDF). Site Walk thumbs (27mm) are context-only by design; when full-size evidence
matters on a walk, the user flips that report to Standard/Detailed.

**Compact / Standard / Detailed — yes, expose exactly these three.** Replace the broken
`Image size` segmented control (Compact/Standard/Large — measured no-op) with one
**Layout density** control mapping to the layout system:

| Density | Effect |
|---|---|
| Compact | `row` layout, cover off, appendix off |
| Standard | The type's native layout and defaults (table above) |
| Detailed | Type's layout + original-photo pairs + photo appendix |

Defaults per type: Site Walk → Compact, Client → Standard, Handover → Detailed. Keep
`imageSize` in `ReportOptions` for stored-data compatibility (map compact→Compact,
standard→Standard, large→Detailed on read; `lib/supabase/mappers.ts` normalizer already
gives the pattern).

---

## 4. Specific technical changes (by file)

1. **`constants/config.ts`** — extend `ReportTheme` with layout config:
   `itemLayout: "row" | "card" | "evidence"`, `photoBox: { w: number; h: number }`
   (mm), `thumbBox`, `coverDefault: boolean`, `timestampsDefault: boolean`. Values per
   §2/§3. (Pattern precedent: the `accentText` field added for the cover-tag contrast
   fix.)
2. **`lib/report.ts`**
   - Delete the `itemPhotoWidth` 66% override (`:366-367`) and the `--pw`/`--mh`/
     `max-width` clamp CSS (`:562-567`); compute `drawW`/`drawH` per figure in TS as in
     §3 and emit mm dimensions inline.
   - Change `.photo-frame img` from `object-fit: cover` to `contain` (with the frame now
     aspect-exact this is belt-and-braces, not a visual change).
   - Add the three item renderers: `renderItemRow`, `renderItemCard` (two-column),
     `renderEvidenceBlock`. Single status chip (header only). `row` drops the meta grid
     for one muted line: `Location · Assignee · Priority`.
   - Site Walk: when `coverPage` is off, emit the header band section (brand row +
     title + counts strip) above the summary table on page 1; suppress the standalone
     cover/summary `.page` breaks so page 1 flows into rows.
   - Handover: photo appendix section behind `options.layoutDensity === "detailed"`;
     figures reference `issueRef` numbers; 2×2 grid pages.
   - Keep: hit-list table, blur redaction logic, `escapeHtml` discipline, group headers
     (`page-break-after: avoid` already present).
3. **`types/models.ts`** — add `layoutDensity: "compact" | "standard" | "detailed"` to
   `ReportOptions` (+ `DEFAULT_REPORT_OPTIONS.layoutDensity = "standard"`).
4. **`lib/supabase/mappers.ts`** — normalize `layoutDensity` with the existing
   defaulting pattern; map legacy `imageSize` values when `layoutDensity` is absent.
5. **`app/audit/[id]/report.tsx`** — `selectPreset` now also applies the preset's
   default density + cover/timestamps defaults (still user-overridable in Advanced);
   replace the Image size `Segmented` with Layout density (Compact/Standard/Detailed).
6. **`lib/reportPresets.ts`** — preset summaries updated to name the real differences
   ("~6 items/page", "3 items/page, client-polished", "full evidence + appendix").
7. **Tests** — extend `lib/__tests__/reportPresets.test.ts`; new unit tests for the
   pure photo-box function (`computePhotoBox(ar, layout)`): landscape clamp, portrait
   clamp, degenerate dims; snapshot-ish assertions that `buildReportHtml` emits `row`
   markup for sitewalk, `evidence` for handover, no `--pw` CSS var anywhere.
8. **`scripts/measure-report-density.mjs` (new dev tool)** — port of the measurement
   harness used for this review (drive builder → intercept print popup → Chromium
   `page.pdf` → pdf-lib page count) so the acceptance criteria below are checkable in
   one command. Session artifacts to port from: `scratchpad/report-audit/
   measure-reports.mjs` + `measure-portrait.mjs`.

**Explicitly out of scope (measured non-problems):** photo re-encode resolution, font
embedding, PDF file size, hit-list table design, privacy/blur path, page-number margin
boxes (unsupported by both WKWebView and Chromium print — the existing TODO at
`report.ts:449-455` is correct).

---

## 5. Prioritised implementation tasks (Cursor/Codex-ready)

| # | Pri | Task | Files | Done means |
|---|---|---|---|---|
| T1 | P0 | Fixed-height TS-computed photo boxes; delete 66% single-photo override and `--pw/--mh` CSS | `lib/report.ts` | Portrait and landscape 10-item runs produce equal page counts; Compact ≠ Standard output |
| T2 | P0 | Site Walk `row` layout + cover-off default + page-1 header band | `lib/report.ts`, `constants/config.ts` | 10-item Site Walk ≤ 3 pages |
| T3 | P1 | Client `card` two-column layout; single chip; no client timestamps | `lib/report.ts` | ≥3 items/page on client detail pages |
| T4 | P1 | Handover `evidence` layout + guaranteed sign-off block | `lib/report.ts` | 10-item handover ≤ 8 pages incl. pairs |
| T5 | P1 | `layoutDensity` option end-to-end (model, mappers, builder UI, preset defaults, legacy `imageSize` migration) | `types/models.ts`, `lib/supabase/mappers.ts`, `app/audit/[id]/report.tsx` | Density control changes page counts monotonically |
| T6 | P2 | Photo appendix (Detailed) with item-number references | `lib/report.ts` | 4 photos/page, no split cells |
| T7 | P2 | Break tuning: keep group header with first item; signature block never orphaned; verify no trailing blank page at 10/25/50 items | `lib/report.ts` | Zero blank pages in harness runs |
| T8 | P2 | Commit `scripts/measure-report-density.mjs`; wire into docs | `scripts/` | One command prints the §1-style table |
| T9 | P3 | Optional: re-encode embeds to 1400px when report contains >30 photos | `lib/reportImages.ts` | 50-item PDF ≤ 2MB, no visible print loss |

Suggested order: T1 → T2 (ships the headline fix), then T5, T3, T4, then the rest.
T1+T2 alone take the flagship case from 11 pages to ≈3.

---

## 6. Acceptance criteria

Run the harness (T8) against the production web build for each criterion.

1. **10-item Site Walk, one photo per item, default options: ≤ 3 pages total** (today:
   11) and ≥ 5 items per item-page.
2. **10-item Client, Standard: ≤ 6 pages total**, ≥ 3 items per detail page, cover +
   summary retained.
3. **10-item Handover, Detailed (marked-up + original pairs + sign-off): ≤ 8 pages**,
   zero evidence dropped relative to today's output (same figure count).
4. **Orientation invariance:** the same 10 items as portrait vs landscape photos differ
   by **0 pages** (today: +2).
5. **Density control is real:** Compact < Standard < Detailed page counts for the same
   audit; no two density settings may produce byte-identical PDFs (today's Compact
   does).
6. **No distortion or mis-rotation:** every photo renders aspect-true (`contain`) inside
   its box; annotation overlays stay aligned (spot-check the markup-studio sample
   issues); blur redaction still covers in all layouts including thumbs and appendix.
7. **No awkward splits or blanks:** no item card/row split across pages; no page with
   > 45mm trailing white space except the final page of a section; zero fully blank
   pages at 10, 25 and 50 items.
8. **Readability:** marked-up photos render ≥ 55mm tall in Client/Handover layouts;
   Site Walk thumbs are ≥ 27mm with the full-size available via Detailed density.
9. **Scale:** 50-item Site Walk ≤ 12 pages (today: 35) and PDF ≤ 3MB; 25-item Client ≤
   12 pages (today: 20).
10. **No regressions:** `tsc` clean, all Jest suites green (314+ tests), lint at its
    2 known pre-existing warnings, and the P0 durability behaviours (IndexedDB refs in
    reports, honest save signals) untouched.

---

*Appendix — reproduction:* measurement scripts and the nine generated PDFs from this
review live in the session scratchpad (`report-audit/`); the method is: serve
`expo/dist`, drive the report builder UI per preset, capture the print-popup HTML,
render `page.pdf({format:"A4"})`, count pages with pdf-lib. Portrait runs swap each
asset's stored width/height, which is what drives frame geometry in `report.ts`.
