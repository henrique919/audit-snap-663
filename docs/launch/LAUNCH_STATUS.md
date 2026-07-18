# PunchThis — Launch Status

**Single source of truth for task state.** Update after every iteration (Claude) / before reporting completion (Cursor).
Statuses: `BACKLOG` · `READY` · `IN PROGRESS` · `BLOCKED` · `IN REVIEW` · `PASSED` · `DEFERRED`

**Active gate:** A (controlled web/PWA early access; pilot is free for 30–60 days per EXT-6 decision)
**Branch:** `claude/punchthis-launch`
**Last updated:** 2026-07-18 (batch: LP-02/07 IN REVIEW; LP-03 → IN REVIEW)

## Gate A tasks

| ID | Description | Pri | Status | Owner | Branch/commit | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| LP-01 | True Clear All Data (records + owned media) | P0 | **PASSED** | Cursor impl / Claude review | `b2f5055` | Claude independent verify 2026-07-18: typecheck clean; 157/157 tests (8 new in `wipe.test.ts`); lint 2 known warnings; diff review clean (dir-constant scoping, typed `ResetAllDataResult`, honest partial-failure path, web no-op, mock path matches `expo-file-system/legacy`). Live web preview: Clear all data → confirm → "All data cleared" alert, projects/issues/assets all 0 in storage; Reset demo data → confirm → "Demo data restored" alert, Harbourview + 8 issues back; zero console errors. Native FS delete = mocked unit tests (no device; accepted per plan). | — |
| LP-02 | Remove dead Voice control + remove unfinished Sync Centre surface | P0 | **IN REVIEW** | Cursor | claude/punchthis-launch (see log) | Web 390×844: capture-session shows Gallery+shutter, no Voice; Settings has no Sync Centre / “future sync”; About = “Local-first: everything is stored on this device.” Grep `future update` in app/components empty. test 157 · typecheck · lint (2 known) · build:web OK. | Claude review |
| LP-07 | GitHub Actions CI (typecheck/lint/test/web build) | P0 | **IN REVIEW** | Cursor | claude/punchthis-launch | Added `.github/workflows/ci.yml` (PR→main, push→main+launch; bun frozen-lockfile → typecheck → lint → test → build:web). Regenerated `expo/bun.lock` so `--frozen-lockfile` succeeds locally. Identical steps proven locally. **Green-on-GitHub unverifiable until branch is pushed** (batch forbids push). | Claude review |
| LP-03 | Repair sample data (bundled matching photos, sample labels, device-locale dates) | P0 | **IN REVIEW** | Cursor | claude/punchthis-launch (see log) | Bundled SAMPLE PNGs in `assets/seed/` (8 issues + cover, ≤12KB each, no remote URLs). `buildDemoDb` async via real media pipeline; project “Sample — Harbourview…”; Site Walk theme; `formatShortDate` for audit-new title. Tests: seed.test + dates.test. Web 390×844 reseed shows Sample project on Home. test 165 · typecheck · lint (2 known) · build:web OK. | Claude review |
| LP-04 | About/support/data-safety surfaces + provisional legal wording | P0 | **IN PROGRESS — batch 4/6** | Cursor | — | — | In batch |
| LP-05 | Export-all safety archive (archival, not restore) | P0 | **IN PROGRESS — batch 5/6** | Cursor | — | — | In batch |
| LP-06 | Accessibility: shared primitives, states, contrast tokens | P0 | **IN PROGRESS — batch 6/6** | Cursor | — | — | In batch; native SR pass deferred to LP-09 |
| LP-08 | Production app identity — preferred `com.punchthis.app` (no country code) | P0 | **BLOCKED** (LP-10 clearance search + domain check must pass; EXT-3 accounts for store verify) | Cursor when unblocked | — | — | Claude runs LP-10 first |
| LP-09 | Native release-candidate device matrix | P0 | **BLOCKED** (EXT-3 accounts, EXT-5 devices; simulator/emulator subset allowed meanwhile) | Claude+operator | — | — | LP-13 prepares the script pack |

## Claude-owned program tasks (from EXT decisions, 2026-07-18)

| ID | Description | Status | Notes |
|---|---|---|---|
| LP-10 | Initial trademark/name search: IP Australia, WIPO GBD, USPTO, EUIPO/TMview, UK, NZ, Canada — exact + similar spelling/sound, construction/inspection/reporting software classes; plus punchthis.com/.app domain check | READY (Claude, research task) | Output: findings doc + recommendation; NOT formal legal clearance. Gates LP-08 identity lock. |
| LP-11 | Owner checklist: Apple Developer + Google Play Console account creation/confirmation (identity, D-U-N-S if entity, assets each store needs) | READY (Claude, doc) | Unblocks EXT-3 execution by operator |
| LP-12 | Draft content for public `/privacy`, `/terms`, `/support`, `/data-deletion` routes (static, versioned, provisional-marked; no account-deletion claims — no accounts exist) | READY (Claude, drafts; deploy blocked on domain decision) | Store submission blocker only; not a Gate A blocker |
| LP-13 | Physical-device QA script pack so owner/tester can execute LP-09 efficiently | BACKLOG (after LP-04/05 land — scripts must cover final surfaces) | |

## P1/P2/P3

| ID | Description | Status |
|---|---|---|
| LP-20 | Quick Walk (first issue <60s) | BACKLOG (post-Gate A) |
| LP-21 | Closeout hub on Done | BACKLOG |
| LP-22 | Preset-first reporting + Advanced | BACKLOG |
| LP-3x | P2 closeout loop sequence (due dates → verify → contractor links …) | BACKLOG (order fixed in master plan) |
| LP-4x | P3 cloud foundations | BACKLOG (design constraints only) |

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
