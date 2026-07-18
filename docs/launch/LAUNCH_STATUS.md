# PunchThis — Launch Status

**Single source of truth for task state.** Update after every iteration (Claude) / before reporting completion (Cursor).
Statuses: `BACKLOG` · `READY` · `IN PROGRESS` · `BLOCKED` · `IN REVIEW` · `PASSED` · `DEFERRED`

**Active gate:** A (controlled web/PWA early access; pilot is free for 30–60 days per EXT-6 decision) — CONDITIONAL GO on main
**Branch:** `cursor/batch2-p1-activation` (off `main` @ `a87f19f`)
**Last updated:** 2026-07-19 (LP-23 IssueCard nested-button fix → IN REVIEW)

## Gate A tasks

| ID | Description | Pri | Status | Owner | Branch/commit | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| LP-01 | True Clear All Data (records + owned media) | P0 | **PASSED** | Cursor impl / Claude review | `b2f5055` | Claude independent verify 2026-07-18: typecheck clean; 157/157 tests (8 new in `wipe.test.ts`); lint 2 known warnings; diff review clean (dir-constant scoping, typed `ResetAllDataResult`, honest partial-failure path, web no-op, mock path matches `expo-file-system/legacy`). Live web preview: Clear all data → confirm → "All data cleared" alert, projects/issues/assets all 0 in storage; Reset demo data → confirm → "Demo data restored" alert, Harbourview + 8 issues back; zero console errors. Native FS delete = mocked unit tests (no device; accepted per plan). | — |
| LP-02 | Remove dead Voice control + remove unfinished Sync Centre surface | P0 | **PASSED** | Cursor / Claude | `93e9506` | Claude verify 2026-07-18: `grep future update\|coming soon` in app/components = empty; `sync.tsx` deleted, no `/sync` refs; SyncPill retained (truthful). Live: Home + Settings clean. | — |
| LP-07 | GitHub Actions CI (typecheck/lint/test/web build) | P0 | **PASSED (push-pending)** | Cursor / Claude | `e146bcb` | Claude verify: `.github/workflows/ci.yml` reviewed — real commands (frozen-lockfile → typecheck → lint → test → build:web), PR→main + push→main/launch, concurrency + 20m timeout, no placeholders. All 5 steps proven locally (209 tests, typecheck, lint, build). **Green-on-GitHub unverifiable until branch pushed.** | Operator/Claude: push branch |
| LP-03 | Repair sample data (bundled matching photos, sample labels, device-locale dates) | P0 | **PASSED** | Cursor / Claude | `8120aa3` | Claude verify (live reseed): project = "Sample — Harbourview Apartments Stage 2"; preparedFor "Meridian Property Group (sample)"; 8 assets all `data:image/jpeg` (bundled), **0 http URLs in seed**; issue #008 switchboard renders a 1200×900 sample JPEG (loaded, complete) — **flag defect fixed**; Site Walk theme; `formatShortDate` locale dates. seed.test + dates.test pass. | — |
| LP-04 | About/support/data-safety surfaces + provisional legal wording | P0 | **PASSED** | Cursor / Claude | `f22dc45` | Claude verify (live): Data & privacy screen renders all approved wording verbatim + Provisional banner; RETENTION copy honestly matches LP-01 behaviour; no banned claims (cloud/encrypted/secure); first-run notice + Dismiss have a11y labels (visible in a11y tree); About version/publisher/support-mailto present. **OPERATOR FLAG:** SUPPORT_EMAIL/PUBLISHER_NAME provisional (henrysestak@gmail.com / Henry Sestak) — confirm. | Operator: confirm identity values |
| LP-05 | Export-all safety archive (archival, not restore) | P0 | **PASSED** | Cursor / Claude | `56eba77` (+UI `a22963b`) | Claude verify (live export): real 267KB `application/zip` `punchthis-export-20260718-2322.zip`, PK sig, **30 entries** — records/ (all 10 tables), settings.json, media/ (8 originals + 8 thumbs + cover), manifest.json; success alert "not restorable in-app". Scale ceiling documented in EXPORT_FORMAT.md. Note: UI row mislabeled `feat(lp-04)` in `a22963b` (cosmetic; final state coherent). | — |
| LP-06 | Accessibility: shared primitives, states, contrast tokens | P0 | **PASSED (web scope)** | Cursor / Claude | `9fd4386` (+ LP-23) | Claude verify: a11y tree populated; contrast ≥4.5:1. **LP-23 resolved the IssueCard nested-button caveat** (sibling buttons; roles/labels preserved). Native VoiceOver/TalkBack + 200% sweep deferred to LP-09. | LP-09 native SR |
| LP-08 | Production app identity — `com.punchthis.app` | P0 | **PASSED** | Cursor / Claude | `68a86b6` | Claude verify: bundle/package `com.punchthis.app`, scheme+slug `punchthis`, rork origin removed; `@rork-ai/toolkit-sdk` fully removed (dep + `withRorkMetro` wrap + `.rork` ignore + README boilerplate) — bun.lock has 0 rork refs. **Critical runtime check: app boots + bundles cleanly on the new metro config** (fresh restart, no server/console errors). L17 documents new-install upgrade. | — |
| LP-09 | Native release-candidate device matrix | P0 | **BLOCKED** (EXT-3 accounts, EXT-5 devices; simulator/emulator subset allowed meanwhile) | Claude+operator | — | — | LP-13 prepares the script pack |

## Claude-owned program tasks (from EXT decisions, 2026-07-18)

| ID | Description | Status | Notes |
|---|---|---|---|
| LP-10 | Initial trademark/name search: IP Australia, WIPO GBD, USPTO, EUIPO/TMview, UK, NZ, Canada — exact + similar spelling/sound, construction/inspection/reporting software classes; plus punchthis.com/.app domain check | READY (Claude, research task) | Output: findings doc + recommendation; NOT formal legal clearance. Gates LP-08 identity lock. |
| LP-11 | Owner checklist: Apple Developer + Google Play Console account creation/confirmation (identity, D-U-N-S if entity, assets each store needs) | READY (Claude, doc) | Unblocks EXT-3 execution by operator |
| LP-12 | Draft content for public `/privacy`, `/terms`, `/support`, `/data-deletion` routes (static, versioned, provisional-marked; no account-deletion claims — no accounts exist) | READY (Claude, drafts; deploy blocked on domain decision) | Store submission blocker only; not a Gate A blocker |
| LP-13 | Physical-device QA script pack so owner/tester can execute LP-09 efficiently | BACKLOG (after LP-04/05 land — scripts must cover final surfaces) | |

## P1/P2/P3

| ID | Description | Pri | Status | Owner | Branch/commit | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| LP-20 | Quick Walk (first issue <60s) | P1 | **PASSED** | Cursor / Claude | `0f1707d` | Claude live verify 2026-07-19: Capture leads with Quick Walk → modal (pick/create project) → Start → lands on `/capture-session?quickWalk=1&walkStartedAt=…` with a fresh "Site Walk — {date}" audit, no audit-new form. Pure defaults tested (`quickWalk.test.ts`); new `lastTimeToFirstIssueMs` optional settings field backfills via driver merge. 222 tests · typecheck · lint (2 known) · build:web. | — |
| LP-21 | Closeout hub on Done | P1 | **PASSED** | Cursor / Claude | `e112e6d` | Claude live verify: hit list shows CLOSEOUT block — counts 3 Open/1 Assigned/2 In progress/2 Completed (=8, accurate); real completeness warnings "2 issues need details" → #004/#006 missing assignee, linking to issues; Preview + Generate present; no dead assignee-pack control. `closeoutHub.test.ts` pure logic. | — |
| LP-22 | Preset-first reporting + Advanced | P1 | **PASSED** | Cursor / Claude | `200a25b` | Claude live verify: report leads with Client/Site Walk/Handover + one-line summaries; Advanced collapsed by default; switching to Handover updated the summary AND persisted `Project.lastReportThemeKey="handover"`. Optional model field (no migration). "Executive→Client" is a label-only rename of the executive theme (its own description is "polished client handover") — legitimate, PDF cover variant unchanged. | — |
| LP-23 | Fix nested `<button>` on IssueCard (LP-06 regression) | P1 | **IN REVIEW** | Cursor | `cursor/batch2-p1-activation` | IssueCard: View wrapper; main + kebab sibling buttons (`moreParent=DIV`, 8 cards × 0 nested). Hitlist load: 0 console errors. Card → issue; kebab → actions; Tab card→kebab. ProjectCard OK (no nested interactive). Gate: 222 · typecheck · lint (2 known) · build:web. Residual: ActionSheet backdrop still nests buttons when opened (separate from IssueCard). | Claude review |
| LP-3x | P2 closeout loop sequence | P2 | BACKLOG | — | — | — | Needs backend |
| LP-4x | P3 cloud foundations | P3 | BACKLOG | — | — | — | Design constraints only |

## Known limitations accepted for Gate A

Local-first only; no team features; no cloud backup; archival export (no in-app restore); native store distribution deferred; legal wording provisional pending review (labelled); pilot free (no paywall — decision L15).

## Iteration log

| Date | Iteration | Outcome |
|---|---|---|
| 2026-07-18 | Program init | Branch created from `d90a38d`; six launch docs authored; review findings converted to LP backlog; LP-01 assigned to Cursor. |
| 2026-07-18 | LP-01 impl | Added `expo/lib/wipe.ts` (`wipeOwnedMediaDirs` + `summarizeWipe`); wired into `resetAllData` after driver clear (reseed path included); Settings shows success only on full wipe success, honest partial-failure alert with safe retry. Status → IN REVIEW. |
| 2026-07-18 | LP-01 review | Claude verified independently (tests/typecheck/lint + full diff review + live web walkthrough of both flows, zero console errors). **PASSED.** Stray 237-byte `NUL` redirect artifact from the impl run removed from repo root. |
| 2026-07-18 | EXT decisions | Operator resolved EXT-1…6 (global-first identity, four public legal routes, accounts pending, provisional wording OK, emulator testing allowed, free pilot + A$129 Founding Inspector hypothesis). Recorded as decisions L10–L15; LP-10…LP-13 added. LP-02 assigned. |
| 2026-07-18 | Batch assignment | Operator switched the loop to batch mode (decision L16). Single-task LP-02 assignment superseded by the full batch LP-02→LP-07→LP-03→LP-04→LP-05→LP-06 with per-task gates, one commit per task, resume-safe start. Full briefs in CURSOR_LAUNCH_LOOP.md. |
| 2026-07-18 | LP-02 impl | Removed Voice control + Sync Centre route/row; About copy factual local-first only. Status → IN REVIEW. |
| 2026-07-18 | LP-07 impl | Added GitHub Actions CI workflow + honest lockfile refresh for frozen installs. Status → IN REVIEW (GH run pending push). |
| 2026-07-18 | LP-03 impl | Replaced remote stock photos with bundled SAMPLE seed images + media-pipeline materialisation; Sample labelling; device-locale dates; Site Walk theme coherence. Status → IN REVIEW. |
| 2026-07-18 | LP-04 impl | About/support/data-privacy surfaces + provisional copy module; first-run storage notice. Status → IN REVIEW (`f22dc45`). |
| 2026-07-18 | LP-05 impl | Export-all zip archive (archival only) + format doc + jszip. Status → IN REVIEW (`56eba77`; Settings row also in `a22963b`). |
| 2026-07-18 | LP-06 impl | A11y primitives/states + contrast token fixes + contrast regression suite. Status → IN REVIEW. Batch LP-02→LP-07 complete for Claude review. |
| 2026-07-18 | LP-08 impl | Replaced Rork placeholder identity with `com.punchthis.app` / scheme `punchthis`; Expo start scripts; decision L17 upgrade note. Status → IN REVIEW. |
| 2026-07-18 | **Batch review (LP-02→LP-08)** | Claude independent verification of the whole batch: 209/209 tests, typecheck clean, lint 2 known warnings; full re-review of each commit's diff; fresh preview restart confirming the app boots + bundles on the post-Rork metro config; live checks — sample reseed (Sample label, 0 http URLs, #008 renders sample image not flag), Data & privacy screen wording, a11y tree now populated, real 267KB/30-entry export zip. **All seven → PASSED** (LP-07 push-pending, LP-06 web-scope). Two stray `NUL` artifacts removed. Operator flags: confirm LP-04 support email/publisher; push branch to prove CI green. |
| 2026-07-19 | Batch 2 start | Fresh branch `cursor/batch2-p1-activation` from `main` @ `a87f19f`. Order LP-20 → LP-21 → LP-22. |
| 2026-07-19 | LP-20 impl | Quick Walk capture-first path + skippable setup prompt + pilot TTFI metric. Status → IN REVIEW. |
| 2026-07-19 | LP-21 impl | Closeout hub on hit list (counts, completeness warnings, Preview/Generate). Status → IN REVIEW. |
| 2026-07-19 | LP-22 impl | Preset-first report builder + Advanced collapse + per-project theme memory. Status → IN REVIEW. Batch 2 complete. |
| 2026-07-19 | **Batch 2 review (LP-20→22)** | Claude independent verification: 222 tests, typecheck clean, lint 2 known; per-commit diff review (clean tested pure logic in quickWalk/closeoutHub/reportPresets; optional model fields backfill via driver merge — no migration); live web walkthrough of all three — Quick Walk → capture-session, closeout counts+warnings accurate, preset switch persists per-project. **All three PASSED.** **Regression found:** LP-06's IssueCard role-button additions nest `<button>` in `<button>` on web (hit list) → logged as **LP-23** with a ready fix brief; LP-06 status caveated. |
| 2026-07-19 | LP-23 impl | Un-nested IssueCard main press + kebab into sibling buttons under a View wrapper. LP-06 caveat cleared. Status → IN REVIEW. |
