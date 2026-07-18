# PunchThis — Launch Status

**Single source of truth for task state.** Update after every iteration (Claude) / before reporting completion (Cursor).
Statuses: `BACKLOG` · `READY` · `IN PROGRESS` · `BLOCKED` · `IN REVIEW` · `PASSED` · `DEFERRED`

**Active gate:** A (controlled web/PWA early access)
**Branch:** `claude/punchthis-launch` @ base `d90a38d`
**Last updated:** 2026-07-18 (program initialised)

## Gate A tasks

| ID | Description | Pri | Status | Owner | Branch/commit | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| LP-01 | True Clear All Data (records + owned media) | P0 | **READY → assigned to Cursor** | Cursor impl / Claude review | claude/punchthis-launch | — | Cursor executes task prompt LP-01 (see CURSOR_LAUNCH_LOOP.md §Current assignment) |
| LP-02 | Remove dead Voice control + demote future-sync UI | P0 | READY | Cursor | — | — | Queue after LP-01 |
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
