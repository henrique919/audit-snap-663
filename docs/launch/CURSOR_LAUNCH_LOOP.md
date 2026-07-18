# CURSOR_LAUNCH_LOOP — operating contract for the implementation agent

You are Cursor, the implementation agent for the PunchThis launch program.
Claude is the launch orchestrator and reviewer. Complete only the task currently assigned by Claude (bottom of this file). Do not select the next task; return control to Claude.

Repo facts you must respect:

- App code lives under `expo/` (Expo SDK 54 / RN 0.81 / React 19 / expo-router 6 / TypeScript).
- Commands run from `expo/`: `bun install`, `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build:web`.
- Working branch: `claude/punchthis-launch`. Never commit to `main`. Never push.
- Untracked audit artifacts (`PUNCHTHIS_FULL_APP_REVIEW.md` was committed; `.audit-output/` stays untracked) and root program docs (`STATUS.md`, `ROADMAP.md`, `DECISIONS.md`, `EXECUTION_PLAYBOOK.md`, `ARCHITECTURE.md`) must never be deleted or rewritten.
- Cross-platform dialogs go through `expo/lib/dialogs.ts` (`showAlert`/`showConfirm`/`showActions`) — never `Alert.alert`.
- Design system: use tokens from `expo/constants/theme.ts` and existing shared components. Do not invent a new visual direction.
- The marketing website is out of scope. Never spend time on it.

## At the start of every iteration

1. Read: `PUNCHTHIS_FULL_APP_REVIEW.md`, `docs/launch/LAUNCH_MASTER_PLAN.md`, `docs/launch/LAUNCH_STATUS.md`, `docs/launch/DECISIONS.md`, and the current task assignment below.
2. Inspect the affected code and existing patterns.
3. Confirm the acceptance criteria (they live in LAUNCH_MASTER_PLAN.md under the task ID).
4. Inspect the working tree; preserve unrelated changes.
5. State which files you expect to modify before modifying them.

## During implementation

1. Follow existing PunchThis architecture and design system; reuse shared components/tokens.
2. Do not redesign unrelated screens.
3. No fake implementations; no visible "coming soon" controls.
4. No unsupported security/backup/privacy/sync/collaboration claims.
5. Add or update tests for behaviour changes (jest-expo; tests live in `expo/lib/__tests__/` and `expo/lib/persistence/__tests__/` — jest `roots` cover `lib/`, so extract screen logic into `lib/` pure functions when it needs testing).
6. Handle loading, empty, failure, offline, retry, and destructive states.
7. Preserve data compatibility or implement a tested migration.
8. Keep the change small enough for focused review.
9. Never delete or overwrite unrelated user work.

## Before reporting completion

1. `bun run test` — all green.
2. `bun run typecheck` — clean.
3. `bun run lint` — clean (2 pre-existing warnings in `markup/[assetId].tsx` are known; add none).
4. `bun run build:web` where the change affects runtime code.
5. Manually test the affected workflow (web preview; native-only behaviour → unit tests + explicit note).
6. Inspect affected screens at 390×844.
7. Check a11y roles/labels/states/contrast/focus on touched UI.
8. Check error and recovery paths.
9. Update `docs/launch/LAUNCH_STATUS.md` (status → IN REVIEW, evidence links).
10. Report: behaviour changed · files changed · tests run · build result · visual evidence · remaining risks · commit hash.

If a check fails: fix and re-validate. If blocked: document the exact blocker; do not bypass with a placeholder. Then stop and return control to Claude.

---

## Current assignment

**Task: LP-02 — Remove dead Voice control + remove unfinished Sync Centre surface** (assigned 2026-07-18; LP-01 PASSED review at `b2f5055`)

**Problem.** Two production surfaces promise features that do not exist. (1) The capture screen's Voice button (`expo/app/capture-session.tsx:344-352`) only shows "coming in a future update". (2) The Sync Centre screen (`expo/app/sync.tsx`, 112 lines) is entirely future promises — "Cloud backup and multi-device sync are coming in a future update", a "Pending for future sync" outbox count, and a wifi-only preference toggle for a feature that does not exist — reached from a Settings row whose subtitle is "All work saved on device · N records pending future sync" (`expo/app/(tabs)/settings.tsx:209`). Gate A requires no dead primary controls and no unsupported claims.

**Scope.**
1. Remove the Voice `TouchableOpacity` block from `capture-session.tsx` entirely (including now-unused `Mic` import and any orphaned styles). Verify the side-button column layout still balances at 390×844 — adjust spacing only as needed, no redesign.
2. Delete `expo/app/sync.tsx` and remove the Settings row that links to it. Replace that Settings row with nothing (the storage/data section already communicates local-first; LP-04 will add the full approved wording). Remove any `router.push`/link references to the sync route (grep for `"/sync"` and `sync` route usages) so no dead route remains; typedRoutes will catch strays in typecheck.
3. Trim remaining future-promise copy in Settings: `settings.tsx:277-278` "Cloud backup, multi-device sync and web access arrive in a future update." → replace with a plain local-first statement, e.g. "Local-first: everything is stored on this device." (exact approved long-form wording lands in LP-04 — keep this minimal and factual, promise nothing).
4. Do NOT touch `lib/persistence/*`, the outbox logic, or `syncStatus` fields — they are architecture (root ARCHITECTURE.md §2), not UI. Only UI surfaces go.
5. If any test references the sync screen or Voice control, update it. Add no new tests unless behaviour logic changed (this is removal-only).

**Out of scope:** the pendingCount computation and outbox internals; Settings restructure (LP-04); any new wording beyond the minimal factual line; capture-screen redesign.

**Acceptance criteria:** master plan LP-02 list, plus: `grep -rn "future update" expo/app expo/components` returns nothing user-visible; no route or link to a sync screen; Voice absent from capture; `bun run test`/`typecheck`/`lint` clean (typedRoutes regen may be needed — run through `typecheck`); capture + settings screens verified in web preview at 390×844; `LAUNCH_STATUS.md` → LP-02 IN REVIEW with evidence.
