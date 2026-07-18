# PunchThis — Launch Status

**Single source of truth for task state.** Update after every iteration (Claude) / before reporting completion (Cursor).
Statuses: `BACKLOG` · `READY` · `IN PROGRESS` · `BLOCKED` · `IN REVIEW` · `PASSED` · `DEFERRED`

**Active gate:** A (controlled web/PWA early access)
**Branch:** `claude/punchthis-launch`
**Last updated:** 2026-07-18 (LP-01 implemented → IN REVIEW)

## Gate A tasks

| ID | Description | Pri | Status | Owner | Branch/commit | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| LP-01 | True Clear All Data (records + owned media) | P0 | **IN REVIEW** | Cursor impl / Claude review | `claude/punchthis-launch` (see iteration log for hash) | Unit: `expo/lib/__tests__/wipe.test.ts` (8 tests). Web preview: Clear all data → empty projects + success alert “All projects, audits, and photo/report files…”; Reset demo data → Harbourview restored + “Demo data restored” alert. `bun run test` 157 pass; typecheck clean; lint = 2 known markup warnings only; `bun run build:web` OK. Native file delete covered by mocked FS tests (no device). | Claude reviews LP-01 |
| LP-02 | Remove dead Voice control + demote future-sync UI | P0 | READY | Cursor | — | — | Queue after LP-01 PASSED |
| LP-03 | Repair sample data (bundled matching photos, sample labels, locale) | P0 | READY | Cursor | — | — | Queue |
| LP-04 | About/support/data-safety surfaces + draft legal wording | P0 | READY | Cursor | — | — | Queue |
| LP-05 | Export-all safety archive (archival, not restore) | P0 | READY (after LP-01 helpers) | Cursor | — | — | Queue |
| LP-06 | Accessibility: shared primitives, states, contrast tokens | P0 | READY | Cursor | — | — | Queue; native SR pass deferred to LP-09 |
| LP-07 | GitHub Actions CI (typecheck/lint/test/web build) | P0 | READY | Cursor | — | — | Queue (early — protects later merges) |
| LP-08 | Production app identity (bundle/package/scheme/slug) | P0 | **BLOCKED** (EXT-1 name clearance, EXT-3 accounts) | Cursor when unblocked | — | — | Operator: clear name + accounts |
| LP-09 | Native release-candidate device matrix | P0 | **BLOCKED** (EXT-3, EXT-5) | Claude+operator | — | — | Operator: devices/accounts |

## Acceptance criteria

Acceptance criteria per task live in `LAUNCH_MASTER_PLAN.md` (do not duplicate here; link by ID).

## P1/P2/P3

| ID | Description | Status |
|---|---|---|
| LP-20 | Quick Walk (first issue <60s) | BACKLOG (post-Gate A) |
| LP-21 | Closeout hub on Done | BACKLOG |
| LP-22 | Preset-first reporting + Advanced | BACKLOG |
| LP-3x | P2 closeout loop sequence (due dates → verify → contractor links …) | BACKLOG (order fixed in master plan) |
| LP-4x | P3 cloud foundations | BACKLOG (design constraints only) |

## Known limitations accepted for Gate A

Local-first only; no team features; no cloud backup; archival export (no in-app restore); native store distribution deferred; sample legal wording pending legal review (labelled as such).

## Iteration log

| Date | Iteration | Outcome |
|---|---|---|
| 2026-07-18 | Program init | Branch created from `d90a38d`; six launch docs authored; review findings converted to LP backlog; LP-01 assigned to Cursor. |
| 2026-07-18 | LP-01 impl | Added `expo/lib/wipe.ts` (`wipeOwnedMediaDirs` + `summarizeWipe`); wired into `resetAllData` after driver clear (reseed path included); Settings shows success only on full wipe success, honest partial-failure alert with safe retry. Tests + web preview evidence above. Status → IN REVIEW. |
