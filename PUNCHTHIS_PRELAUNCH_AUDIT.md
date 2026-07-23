# PunchThis — Independent Pre-Launch Audit

**Audit date:** 23 July 2026
**Surface tested hands-on:** production web export (`expo export --platform web` at HEAD `5b316ee`), driven end-to-end in Chromium at 390×844 (phone viewport) via scripted browser automation — every claim below marked **[verified]** was exercised and observed, not inferred from code or docs.
**Surfaces NOT testable in this environment:** native iOS/Android builds (camera hardware, haptics, share sheets, mail composer, file system, VoiceOver/TalkBack, store billing). Everything in that bucket is explicitly marked **[unverified — native]**. No score below pretends otherwise.
**Static verification:** `tsc --noEmit` clean · **222/222 jest tests pass (30 suites)** · GitHub Actions CI green on `main` · web export builds clean (6.7MB dist).
**Prior art:** this audit is independent of, and cross-checked against, `PUNCHTHIS_FULL_APP_REVIEW.md` (18 July) and the LP-01…LP-23 launch program (`docs/launch/LAUNCH_STATUS.md`). Items those docs already fixed were re-verified here rather than trusted.

---

## 1. Launch verdict

### **Limited beta only** — and the current web pilot has two data-loss defects that must be fixed before even that.

Broken down by distribution channel, because the answer differs:

| Channel | Verdict | Why |
|---|---|---|
| **Controlled web/PWA pilot** (the active Gate A plan) | **Blocked on 2 fixes, then GO** | Two silent data-loss defects found in this audit (P0-1 quota exhaustion, P0-2 crop/rotate blob URLs) sit directly on the pilot's stated workflow. Both are web-platform persistence bugs with clear, small-to-medium fixes. Everything else about the pilot posture is honest and ready: truthful "stored on this device" messaging, working export archive, clean CI, zero crashes observed in ~150 scripted interactions. |
| **Public App Store / Google Play launch** | **Delay launch** | Not close yet, and the repo's own launch program already knows it: no store accounts (EXT-3), no EAS build config, no iOS/Android permission usage strings, legal pages not deployed to public URLs (LP-12), zero minutes of real-device QA (LP-09), trademark search not done (LP-10), no crash reporting, no analytics, no monetization decision. The native app itself may well be solid — the architecture strongly suggests it — but **none of it has been verified on a device**, and shipping unverified to stores that punish 1-star "it lost my photos" reviews would be self-harm. |

**The product core deserves to launch.** Capture → markup → report is genuinely better-designed than the incumbent competition in three measurable ways (capture loop speed, annotation editability, report visual quality). The gap between "this is a good product" and "this is launchable" is almost entirely reliability-and-plumbing work, not product work.

---

## 2. Pre-launch blockers

Only items that cause data/photo loss, broken core workflow, wrong report output, subscription problems, serious confusion, privacy/permission concerns, or predictable 1-star reviews:

| # | Blocker | Class | Evidence |
|---|---|---|---|
| BLK-1 | **Silent photo/issue loss at the 5MB web storage quota.** Measured: 104 photo-issue saves accepted by the UI ("#NNN saved on device" toast every time); after reload, **18 issues and 8 photos existed**. localStorage pinned at exactly 5.00MB. **No error banner, no dialog, no console error at any point.** The pilot's target workflow (20-50 issues per inspection) is impossible on the web build: the practical ceiling is **~8-10 real photos** on top of the 2MB seed. Worse, the issues table and assets table fail independently, so issues #9-18 persisted **without their photos** — records referencing images that don't exist. | Data loss | Scripted bulk test, `flow4`: B.1, B.3, Q.1, Q.2 |
| BLK-2 | **Crop/rotate destroys the photo after browser restart (web).** `files.ts:180,203` and `regenerateThumbnail` (`:148`) return expo-image-manipulator's ephemeral `blob:` URL on web and persist it as `reportUri`/`thumbUri`. Blob URLs survive same-session reloads (Chromium origin blob registry) but die on browser restart. Verified with a persistent profile + full relaunch: records intact, original intact, **working copy and thumbnail BROKEN** — markup studio shows a black canvas labeled "SAVED ON DEVICE", hit-list thumb blank, and the generated report renders **two dead grey figures** for that issue (vector arrow floating on nothing). Silent; no recovery path. | Data loss + broken report | `flow3c`: S1.1, S2.1-S2.4; PDF page 4 of `report-final.pdf` |
| BLK-3 | **"Saved on device" success signals are not gated on persistence success.** BLK-1's failure mode is amplified because the capture toast and markup save-state read local state only — 86 consecutive failed saves each showed a green success toast. (This is roadmap item A4, marked addressed for the banner path, but the quota path demonstrably bypasses it: the storage error banner never appeared once during quota exhaustion.) | Serious confusion → data loss | `flow4`: B.4, Q.1 |
| BLK-4 | **(Store gate only) iOS/Android permission usage strings are absent.** `app.json` has no `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` (or plugin equivalents), and `expo-location` is installed but never imported — a linked location module with no feature is a classic App Store review flag. Guaranteed rejection risk in this state. | Store rejection / privacy | `app.json` inspection; `grep` for expo-location imports |
| BLK-5 | **(Store gate only) The externally-blocked list from the launch program remains open:** store accounts (EXT-3), deployed privacy/terms/support/data-deletion URLs (LP-12 drafts exist, nothing public), real-device QA matrix (LP-09 — zero device minutes so far), support email is a personal Gmail (flagged in LP-04 and still provisional), trademark search (LP-10) not executed. | Store readiness | `docs/launch/LAUNCH_STATUS.md` |
| BLK-6 | **No crash reporting or analytics in any build.** A pilot that loses data silently AND reports nothing home means the operator learns about failures from angry emails. Even for Gate A this is a blocker-adjacent gap; for stores it's a blocker. | Launch risk | `package.json` (no Sentry/analytics dep) |

Not blockers, deliberately: no accounts/login (by design for v1), no cloud sync (by design), no paywall (free pilot per decision L15), web print-dialog PDF flow (correct given browser constraints, honestly labeled).

---

## 3. Prioritised action plan

### P0 — must fix before the pilot (all web-platform persistence)

**P0-1 · Move web media out of localStorage (or hard-gate captures)**
- **Screen/component:** `lib/persistence/*`, `lib/filesWeb.ts`, `lib/store.ts` (assets table)
- **Instructions:** Two acceptable shapes, in preference order. (a) Add an IndexedDB media store on web: keep asset *records* in the existing driver, move `originalUri`/`reportUri`/`thumbUri` payloads to IndexedDB blobs keyed by asset id + variant (the `StorageDriver` boundary in `persistence/README.md` was built for exactly this kind of swap; ~50MB+ quotas, and `navigator.storage.persist()` on top). (b) Minimum viable: keep data URIs but call `navigator.storage.estimate()` before each save, hard-block capture at a threshold (e.g. 80%) with an explicit "Storage full — export your data" screen, and stop double-storing `originalUri === reportUri` (an instant ~45% cost cut: store a sentinel and resolve original→report at read time on web).
- **Acceptance criteria:** scripted test captures 50 photo-issues in one web session; after browser restart all 50 issues AND all 50 photos load; if a storage failure is forced (fill the origin quota artificially), the very next save attempt shows a blocking, truthful error and the UI never claims "saved".
- **Difficulty:** Medium (a) / Small (b)

**P0-2 · Re-encode crop/rotate output to durable URIs on web**
- **Screen/component:** `lib/files.ts` — `rotateWorkingImage`, `cropWorkingImage`, `regenerateThumbnail` (web branches)
- **Instructions:** On web, after `ImageManipulator.manipulateAsync`, decode `result.uri` and re-encode via the existing `filesWeb.ts` canvas path (`drawToDataUri`) to a JPEG data URI (or, post-P0-1a, an IndexedDB blob) before returning; same for the thumbnail branch (currently `return uri` — must produce a real ≤500px thumb, which also fixes thumbs silently becoming full-size images after transform). Never let a `blob:` scheme reach `updateAsset`.
- **Acceptance criteria:** crop, save, quit browser, relaunch: markup studio shows the cropped photo; hit-list thumb renders; generated report embeds a real image (no `src="blob:` anywhere in report HTML — add this exact assertion to a test).
- **Difficulty:** Small

**P0-3 · Gate success signals on persistence results**
- **Screen/component:** `capture-session.tsx` (`showSavedToast`), `markup/[assetId].tsx` save-state line, `StorageErrorBanner` wiring
- **Instructions:** Success toast/state only after the driver's save promise resolves; on rejection show the banner AND an inline failure state on the just-saved item. Add a jest test that makes the driver's `saveTables` reject and asserts no success state is shown. Investigate why `QuotaExceededError` never surfaced through the retry layer during quota exhaustion (observed: zero console errors — the rejection is being swallowed somewhere before the banner trigger).
- **Acceptance criteria:** with a full quota, pressing "Save & Next Photo" produces a visible failure within 2s, the issue is NOT added to the in-memory list as saved, and the banner appears.
- **Difficulty:** Small-Medium

**P0-4 · (Before any store build) Permission strings + dependency hygiene**
- **Screen/component:** `app.json`, `package.json`
- **Instructions:** Add `expo-image-picker`/`expo-camera` plugin config with explicit `photosPermission`/`cameraPermission` strings written for review ("PunchThis uses the camera to photograph site issues for your inspection reports."). Remove `expo-location` (installed, never imported) or ship the GPS feature; don't submit with a dormant location dependency. Set `ios.buildNumber` / `android.versionCode`.
- **Acceptance criteria:** `npx expo prebuild --no-install` output contains the custom strings and no location permissions.
- **Difficulty:** Small

### P1 — strongly recommended before the pilot widens

| ID | Change | Where | Instructions (summary) | Acceptance | Diff |
|---|---|---|---|---|---|
| P1-1 | Contrast token pass | global theme + 8 screens | ~40 axe `color-contrast` nodes: muted grey subtitles/section labels (`#8…` greys on white), cobalt "Client" label, red "Open" text on tinted pill. Darken muted-text tokens to ≥4.5:1. | axe WCAG2AA: 0 serious across all 11 routes | S |
| P1-2 | Image alts | IssueCard, capture thumbs, issue detail | 11 `image-alt` criticals: photos need `accessibilityLabel` (→ alt) like "Photo, issue #004" (RN Web maps it). | axe `image-alt`: 0 | S |
| P1-3 | Segmented control ARIA | `components/ui.tsx` Segmented | `role="radio"` without `aria-checked` (8 nodes). Add `accessibilityState={{checked}}` per option + radiogroup on the container. | axe `aria-required-attr`: 0 | S |
| P1-4 | Touch targets ≥44px | hit-list filter/group chips, kebab, small buttons | 23 controls <32px (chips 28px tall). Min-height 44 with padding, keep visual size via inner container if wanted. | no interactive control <40px in scripted sweep | S |
| P1-5 | Quick Walk default on fresh installs | `(tabs)/capture.tsx` modal | When the only project is the bundled sample, preselect **New project** (typed name), not the sample chip — currently one tap sends a real user's first real photos into "Sample — Harbourview Apartments Stage 2". | fresh install → Quick Walk → Start with defaults creates a user project | S |
| P1-6 | PWA manifest + service worker for the pilot | web export | The pilot's only channel currently has **no offline shell** (verified: no SW, no manifest). A construction-site tool that dies without signal on its only distribution channel undercuts the whole "offline-first" claim. Add manifest + precache of the app shell (workbox or hand-rolled). | airplane-mode reload loads the app; Lighthouse "installable" passes | M |
| P1-7 | Crash/error telemetry | app-wide | Sentry (`sentry-expo`) with default PII scrubbing; wire the persistence-failure path as a breadcrumb so BLK-1-class events are visible to the operator. | forced test error appears in dashboard from the pilot build | S-M |
| P1-8 | Copy fix | closeout hub | "1 issue **need** details" → "needs" (singular branch). | visual | S |
| P1-9 | Confirm dialogs: replace `window.confirm` on web | `lib/dialogs.ts` | Functional but jarring browser-chrome dialogs for destructive confirms ("Delete issue?"). Use the existing in-app ActionSheet for 2-button destructive confirms too. | delete/clear flows show branded dialogs | S |
| P1-10 | Report share on web | preview screen | Print-dialog is the PDF path (correct), but add Web Share API (`navigator.share` with the generated HTML→PDF where supported) or at minimum a "Download HTML" fallback so pilot users can send *something* directly. | share action produces a shareable artifact on Chrome Android | M |

### P2 — shortly after launch

| ID | Change | Notes | Diff |
|---|---|---|---|
| P2-1 | Due dates on issues | Model field + issue screen + report column + closeout warning ("2 overdue"). Named gap vs Site Audit Pro in the repo's own analysis. | M |
| P2-2 | Report page numbers | Consciously omitted because Chromium ignores `@page` margin-box counters (documented in `report.ts:435`). Post-process on native (pdf-lib page stamps after `printToFileAsync`); accept + document on web. Competitors' PDFs have them; snag-list consumers reference page numbers in emails. | M |
| P2-3 | XLSX export alongside CSV | Hit list already exports RFC-4180 CSV (verified: proper quoting). XLSX is what UK/US PMs actually forward. `exceljs` or SheetJS on native, or generate on web. | S-M |
| P2-4 | Draw-to-sign signature capture | Report has signature *lines* only. A finger-drawn signature block (existing pen-tool geometry can be reused) closes the "sign-off on site" loop. | M |
| P2-5 | GPS/location stamp per photo | `expo-location` is either removed (P0-4) or shipped for real: capture lat/long at photo time, optional report footnote per figure. Differentiator for dispute evidence. | M |
| P2-6 | Assignee/trade manager UI | Model already has company/email/phone/trade fields; only find-or-create by name is exposed. A simple editor + report "assigned pack" per trade. | M |
| P2-7 | Migrate remaining web tables to IndexedDB | After P0-1a moves media, whole-table JSON strings in localStorage remain the scale ceiling for records (~thousands of issues). The driver boundary makes this incremental. | M |
| P2-8 | Native store submission pack | EAS config, store screenshots (the marketing-site capture pipeline can generate these), listing copy, review notes, TestFlight/internal-track rollout plan. | M |
| P2-9 | Backup nudges | Local-only storage + humans = eventual heartbreak. Periodic "You have 214 photos on this device only — export a backup" prompt wired to the existing export-all ZIP (verified working: 36-entry archive with manifest). | S |

### P3 — future

- Cloud backup + accounts (the outbox/sync architecture is already stubbed; `syncStatus` on every record)
- Shareable web links for reports (the #1 competitor feature that drives referral loops)
- Contractor closeout loop (assignee gets a link, marks done, evidence photo round-trips) — the repo's own review correctly identifies this as the retention unlock, and correctly defers it
- Report templates/custom fields; team roles — **only** after the solo wedge is won. The product's restraint here is a strength; keep it.

---

## 4. Scorecard (0-100)

Scoring basis: hands-on web-build verification + code/architecture reading; native-only surfaces scored with their unverified status priced in, not assumed good.

| # | Category | Score | Basis |
|---|---|---|---|
| 1 | Visual design & polish | **88** | Consistently strong across all 11 screens tested: markup studio (dark, focused, pro), report builder presets, capture draft sheet, closeout hub. Nothing looks templated. Deductions: contrast greys (P1-1), browser-chrome confirm dialogs on web. |
| 2 | Branding & credibility | **76** | Coherent identity app↔report↔site; honest SAMPLE labeling everywhere; report footer/branding flows verified. Deductions: personal-Gmail support address, provisional publisher identity, no deployed legal URLs yet. |
| 3 | Navigation & ease of use | **84** | Tab structure + Quick Walk + closeout hub = clear job-shaped paths; testIDs/labels everywhere. Deductions: sample-project default trap (P1-5), no manual issue reorder. |
| 4 | Onboarding & first-use | **80** | Verified: seeded demo renders instantly, honest first-run storage notice, Quick Walk → first issue in <7s scripted (<60s human target easily met), optional post-first-issue setup prompt is genuinely good design. Deduction: P1-5 trap; no coach marks (acceptable). |
| 5 | Project & inspection setup | **82** | Smart defaults (date/client/inspector), find-or-create locations/assignees (verified), per-project report-theme memory (verified). No templates/checklists — deliberate scope, not a defect. |
| 6 | Speed of issue capture | **92** | Measured: ~1.1s per photo-issue in a scripted loop, incl. save; draft sheet with location/assignee chips, priority/status inline; Save & Next vs Save & Review; multi-photo per issue verified. This is the product's crown jewel and it's real. |
| 7 | Camera & photo handling | **58** | Web gallery pick (single + multi) verified incl. EXIF-safe canvas re-encode; batch progress feedback exists. **Native camera path entirely unverified** (LP-09 blocked) — and it's the primary input for the target user. Web quota ceiling (BLK-1) caps what "handling" means today. |
| 8 | Photo markup & annotation | **86** | Verified end-to-end: 9 tools, select/move/restyle/duplicate/delete/z-order per element, undo/redo correct against storage ground truth, crop+rotate (deferred-to-save semantics), privacy blur that exports as opaque redaction (verified in HTML+PDF), vector overlays in reports (crisper than competitors' flattened bitmaps), originals never touched (verified). Deductions: BLK-2 makes crop/rotate destructive-after-restart on web; no resize handles observed for shapes (move+restyle verified; resize unconfirmed in test — minor). |
| 9 | Issue organisation & editing | **83** | Verified: status/priority segmented edits, long descriptions (400+ chars through real UI), location/assignee tap-to-edit, duplicate (sheet), soft-delete with confirm, filters, group-by location/assignee/status, closeout completeness warnings with per-issue links. Missing: manual reorder, bulk operations, due dates. |
| 10 | Offline & data safety | **40** | The native design is genuinely offline-first (local tables, no network dependency, outbox for future sync) — but it's **unshipped and unverified on device**. The shipped channel (web) fails both halves: no offline app shell (verified: no SW/manifest), and the two P0 data-loss defects. Export-all ZIP (verified, 36 entries) is archival-only — no restore path. No cloud backup by design. This is the pillar to fix, and the fixes are known and scoped. |
| 11 | PDF report quality | **87** | Verified against generated PDF: professional cover (brand block, prepared-for/by, stat tiles), summary + hit-list table with pills, location-grouped item pages with meta rows and captioned figures, marked-up + original side-by-side, signature block, honest footer. Three presets with real layout differences. Deductions: no page numbers (documented constraint), BLK-2 can inject dead figures on web, image sizing "large" untested against page-break edge cases. |
| 12 | Exporting & sharing | **70** | Verified: web print-to-PDF flow (correct pattern for the platform, export rows recorded with sentinel), CSV (correct quoting, 8 rows), export-all ZIP with manifest. Unverified: native share sheet, mail composer, native PDF file output. Missing: XLSX, web share, any restore. |
| 13 | Performance & reliability | **84** | Measured: first load ~3.2s (static export, no CDN), hit list interactive in 419ms with 24 issues, 24-issue/1.2MB report generated in 6.4s, zero crashes and zero unexpected console errors across ~150 scripted interactions including hostile ones. Architecture (dirty-table writes, bounded image concurrency, media GC) is production-grade. Reliability score is capped by the silent-failure behavior under quota (counted at #10/#14). |
| 14 | Bugs & broken states | **62** | All tested empty/validation/guard states are honest and specific (0-issue report guard verified firing; empty-filter, no-match search, missing-audit states all correct). But: BLK-1/BLK-2/BLK-3 are exactly the class of bug this category exists for — silent, data-destroying, discovered only later. Plus the "1 issue need details" nit. |
| 15 | Accessibility & mobile usability | **58** | Real strengths: every control labeled (the automation drove the whole app by accessibility labels — the strongest possible evidence they exist), markup studio scans clean, keyboard reaches controls. Real gaps: ~40 contrast nodes, 11 missing image alts, radio state ARIA, 23 sub-32px touch targets. Native screen readers: unverified. |
| 16 | Pricing, paywall & subscriptions | **30** | Nothing shipped: free pilot is a *decision* (L15), entitlement stub (`isEntitled`) exists and gates CSV correctly, "A$129 Founding Inspector" is a hypothesis. Scored as launch-readiness of the commercial layer, not as a criticism of the pilot choice. No store billing, no restore-purchase, no price test evidence. |
| 17 | User retention potential | **66** | For the solo wedge: fast capture + branded reports are the retention loop, and re-audit/theme-memory/closeout features support it. Against it: no reminders/due dates, no cloud safety net (device loss = churn + reputation damage), no contractor loop yet (correctly deferred, but it caps ceiling). |
| 18 | Competitive positioning | **80** | The wedge ("fast, offline-first photo-to-report for solo inspectors, without enterprise setup") is correct, real, and defensible: annotation editability and report polish measurably beat the incumbent utility apps, capture speed at least matches them. Position is undermined only by the not-yet-shipped native channel and undecided pricing. |
| 19 | App Store readiness | **22** | No store accounts, no EAS config, no permission strings, no deployed legal URLs, no device QA minutes, no listing assets, no crash reporting, trademark unsearched. Icons/splash/bundle IDs exist and CI is green — the foundation is fine, the submission layer hasn't started. (Matches the repo's own assessment; nothing here contradicts the team's plan, this score just quantifies it.) |
| 20 | Overall product quality | **74** | See below. |

### Overall PunchThis score: **74/100**

Read as: **core product 85+, launch surface 40**. The capture-markup-report engine is the best part of this product and it is genuinely competitive today. The score is dragged by exactly three things: web-pilot data-safety defects (fixable in days), the unverified native surface (fixable with devices and a week of disciplined QA against the existing script pack plan), and the untouched store/commercial layer (a known, sequenced backlog). None of the drag is product-design debt — which is the best possible shape for a pre-launch audit to find.

---

## 5. Competitive scorecard

**Honesty note:** PunchThis scores come from this audit's hands-on testing. Competitor scores are informed judgments from public materials, store listings, reviews and prior product knowledge — **not** hands-on testing in this audit session, and they should be treated as calibrated estimates (±5), not measurements.

| Dimension | PunchThis | Site Audit Pro | Site Report Pro | AuditBricks | SafetyCulture (iAuditor) |
|---|---|---|---|---|---|
| Capture speed | **90** | 80 | 74 | 76 | 58 |
| Photo markup | **88** | 68 | 70 | 64 | 62 |
| Offline capability | **42** (web today) / ~80 native design, unverified | 88 | 86 | 86 | 82 |
| Report quality | **86** | 74 | 80 | 72 | 76 |
| Ease of use | **85** | 80 | 74 | 76 | 62 |
| Visual polish | **88** | 62 | 58 | 60 | 82 |
| Feature completeness (for this segment) | 68 | **84** | 80 | 78 | 95* |
| Value for money | n/a (free pilot; pricing undecided) | 82 | 76 | 76 | 62 |
| **Overall (as distributable today)** | **58** | **80** | **75** | **74** | **78*** |
| **Overall (product potential at parity plumbing)** | **84** | 80 | 75 | 74 | 78* |

\* SafetyCulture is a template-driven team inspection platform — feature count is not the same axis; it loses on exactly the dimension PunchThis wins (time from photo to sent report, solo ergonomics).

**Features competitors have that PunchThis lacks:** native store distribution (all four), due dates (SAP/SRP), CSV *and* XLSX (SAP), draw-to-sign signatures (SRP, AuditBricks), GPS/location evidence (SAP, iAuditor), cloud backup/sync (all except SAP's local mode), share links (iAuditor), template libraries (iAuditor — deliberately out of scope here).

**Where PunchThis is measurably ahead:** layered *editable* annotations (competitors flatten on save; PunchThis re-edits any element later and renders vector-crisp in the PDF — verified), privacy blur with redaction-safe export (no competitor in this set has an equivalent), report cover/typography quality, capture-loop ergonomics (draft sheet with chips + Save & Next), truth-in-UI (sample data labeled, no fake states — rarer than it should be).

**Features worth adopting:** due dates, XLSX, draw-to-sign, GPS stamps, page numbers. **Features to refuse for v1:** team portals, roles/permissions, RFIs/ITPs, template marketplaces, enterprise admin — the audit endorses the existing restraint; the moment PunchThis chases iAuditor's surface area it loses its only structural advantage (speed).

**Credible points of difference to own:** (1) **"Photo to client-ready PDF in under a minute, all on your phone"** — capture speed + report polish is a demonstrable, filmable claim no incumbent utility matches. (2) **"Mark it up like a pro, fix it later"** — editable layered markup + privacy blur as the evidence-quality story for UK/US dispute-heavy snagging and handover work.

---

## 6. Final launch checklist

**Pilot gate (web/PWA, controlled):**
- [ ] P0-1 media storage fix + 50-photo scripted soak test passing
- [ ] P0-2 crop/rotate durable persistence + browser-restart test passing
- [ ] P0-3 success-signal gating + forced-failure test passing
- [ ] P1-6 PWA manifest + offline shell (or explicitly re-scope the pilot as online-only and say so in the first-run notice)
- [ ] P1-7 crash/error telemetry live in the pilot build
- [ ] Storage headroom indicator or capture hard-stop wired to `navigator.storage.estimate()`
- [ ] Re-run the full a11y sweep after P1-1…P1-4 (11 routes, target: 0 serious)
- [ ] Pilot onboarding email includes: local-only storage warning, export-backup instructions, support contact

**Store gate (after pilot evidence):**
- [ ] Apple Developer + Play Console accounts (EXT-3); D-U-N-S if publishing as entity
- [ ] Replace provisional support email/publisher with real business identity (LP-04 flag)
- [ ] Trademark search executed (LP-10) before the name is on a store listing
- [ ] Deploy `/privacy`, `/terms`, `/support`, `/data-deletion` to public URLs (LP-12); link them in both store listings and in-app
- [ ] `app.json`: permission strings (P0-4), `buildNumber`/`versionCode`, remove `expo-location` or ship GPS
- [ ] EAS build profiles (dev/preview/production) + signing credentials
- [ ] LP-09 device matrix executed on real hardware: camera capture, markup touch/pinch, PDF share sheet, mail composer, offline airplane-mode session, low-storage behavior, VoiceOver/TalkBack pass, 200% font scale
- [ ] Store listing pack: screenshots (the marketing site's capture pipeline can produce these), descriptions, keywords, review notes with demo instructions
- [ ] App Privacy questionnaire (Apple) / Data safety form (Google) — answers are easy (all local, no collection) *if* telemetry choices are documented
- [ ] Crash-free-session threshold defined for staged rollout (e.g. 99.5% before widening)
- [ ] Monetization decision executed or explicitly deferred with a free-tier statement (no IAP = simpler review; decide before listing copy is written)
- [ ] Backup story documented for support: export-all ZIP walkthrough + "device loss means data loss" FAQ honesty

**Ongoing quality gates (already in place — keep them):**
- [x] CI: typecheck + lint + 222 tests + web build on every push (verified green on `main`)
- [x] Truthful-claims discipline between app, docs, and marketing site (`PRODUCT_TRUTH.md` pipeline)
- [x] Media GC with age gate; persistence retry layer; report privacy redaction path

---

## Appendix A — What was tested (traceability)

**Flows executed against the production web export** (scripted, phone viewport, fresh profile per run): first-run seed + notice · Quick Walk with new project · gallery capture (single + 3-file multi) · draft sheet fields (title/notes/location/assignee/priority/status/include) · Save & Next loop ×24 · post-first-issue setup prompt (both paths) · markup studio: arrow/box/text/blur draw, select/move/restyle/duplicate/delete element, undo/redo (verified against storage after every step), rotate, crop, clear-state labels, save/reopen, cold deep-link hydration · issue editing (all fields, 400-char description) · duplicate + soft-delete with confirm · hit-list filters/group modes/closeout hub/completeness warnings · report builder presets + advanced toggles + original-photos option · PDF generation (popup capture → real PDF render) ×4 configurations · report content assertions (branding, client, untitled fallback, SVG overlays, redaction, page-break CSS) · stale-report detection after edit · reports tab listing · CSV export (content-verified) · export-all ZIP (36 entries, manifest-verified) · reset demo / clear-all (confirm + post-reload state) · 0-issue guard · empty/no-match/validation states · 24-issue scale run + 80-save quota exhaustion · browser-restart persistence (persistent profile relaunch) · axe WCAG2A/AA on 11 routes · touch-target sweep · keyboard reachability.

**Key numbers:** 222/222 tests · 0 crashes · 0 unexpected console errors · ~1.1s per captured issue · 419ms hit-list render @24 issues · 6.4s report generation @24 issues · 5.00MB localStorage ceiling · 18/104 issues + 8/104 photos surviving quota exhaustion · 2 silent data-loss defects · 16 axe violation groups (0 in markup studio) · 39 touch targets <40px.

**Not tested (and therefore not asserted):** everything native (camera, share, mail, print-to-file, haptics, screen readers, real offline radios, device performance, low-storage OS behavior), store billing flows (none exist), multi-device anything (none exists by design).
