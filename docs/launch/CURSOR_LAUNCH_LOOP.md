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

**Task: LP-01 — True Clear All Data** (status: assigned 2026-07-18)

The exact briefing prompt for this task is issued by Claude in chat and mirrored here:

**Problem.** Settings → "Clear all data" promises "Delete every project, audit and photo on this device" (`expo/app/(tabs)/settings.tsx:244-245`), but `resetAllData` (`expo/providers/AppStore.tsx:614`) only calls `clearAllData()` (`expo/lib/store.ts:179`) → `driver.clearAll()`, which clears AsyncStorage/localStorage records. Owned native media files in `PHOTO_DIR`, `REPORT_DIR`, `BRAND_DIR` (`expo/lib/files.ts:16-18`) are left as orphans for a later 24h-age-gated GC (`expo/lib/mediaRegistry.ts` `runMediaGc`). The promise is false on native.

**Scope.**
1. New pure-ish module `expo/lib/wipe.ts` exporting `wipeOwnedMediaDirs(): Promise<WipeResult>` where `WipeResult = { ok: boolean; deletedFiles: number; failed: { uri: string; error: string }[] }`. It enumerates and deletes the **contents of exactly** `PHOTO_DIR`, `REPORT_DIR`, `BRAND_DIR` (import the constants — never hard-code paths, never touch anything else), tolerating already-missing dirs/files (missing ≠ failure), continuing past individual failures and collecting them. Web: return `{ ok: true, deletedFiles: 0, failed: [] }` without touching FileSystem.
2. Wire into `resetAllData` in `AppStore.tsx`: after the driver clear succeeds, call `wipeOwnedMediaDirs()`. Order and failure semantics: driver-clear failure → existing `markPersistFailure` path unchanged. File-wipe partial failure → the operation must NOT report success: surface via the existing dialog layer (`lib/dialogs.ts` `showAlert`) with count of files that could not be deleted and instruction that re-running Clear all data is safe. A retry (running Clear all data again) must be idempotent and attempt the remaining files again.
3. The reseed path (`resetAllData(true)`, "Reset demo data") must also wipe files (seeded demo references remote URLs, so nothing owned should survive either way).
4. Settings UI: keep wording; add a brief success confirmation via `showAlert` stating records and photo/report files were deleted (only when actually fully successful). Do not claim success on partial failure.
5. Tests in `expo/lib/__tests__/wipe.test.ts` (mock `expo-file-system` the way `mediaRegistry` tests do): deletes files across all three dirs; missing dir tolerated; individual delete failure collected + `ok:false`; empty dirs OK; web no-op. Add one test covering the resetAllData ordering contract if feasible at lib level (extract decision logic into `wipe.ts` e.g. `summarizeWipe(result): { success: boolean; message: string }` and test that).

**Out of scope:** GC changes (`runMediaGc` stays as the safety net), CSV cache files (`cacheDirectory` — OS-managed), export/backup (LP-05), any UI redesign.

**Acceptance criteria:** master plan LP-01 list, plus: `bun run test`/`typecheck`/`lint` clean; behaviour verified in web preview (no crash, records cleared, honest dialog); native file deletion verified by unit tests (no device available); `LAUNCH_STATUS.md` updated to IN REVIEW with evidence.
