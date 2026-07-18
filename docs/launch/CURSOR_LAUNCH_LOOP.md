# CURSOR_LAUNCH_LOOP — operating contract for the implementation agent

You are Cursor, the implementation agent for the PunchThis launch program.
Claude is the launch orchestrator and reviewer. **Batch mode (operator instruction 2026-07-18, decision L16):** execute the full batch assignment at the bottom of this file — every task, in the stated order, with the per-task gate between tasks — then return control to Claude with the batch report. Do not stop between tasks unless genuinely blocked.

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

## Batch assignment — LP-02 → LP-07 (assigned 2026-07-18; supersedes the earlier single-task LP-02 assignment)

**Execute ALL of the following tasks in this exact order: LP-02 → LP-07 → LP-03 → LP-04 → LP-05 → LP-06.** Start from current HEAD (`9a6d40b`).

### Batch protocol

1. **Resume-safe start:** run `git log --oneline d90a38d..HEAD` and check for existing `(lp-NN)` commits. For any task already committed, run its verification gate only (don't re-implement); begin implementing at the first task with no commit.
2. **Per-task gate (run between every task — no exceptions):**
   a. `bun run test` all green · `bun run typecheck` clean · `bun run lint` clean (2 known markup warnings only, add none) · `bun run build:web` succeeds when runtime code changed.
   b. Manually verify the affected workflow in the web preview at 390×844 (`npx expo start --web --port 8091` from `expo/` if not already running; it may already be up).
   c. Update `docs/launch/LAUNCH_STATUS.md`: task row → IN REVIEW + concrete evidence; append an iteration-log line.
   d. **One commit per task**, message `fix|feat|chore(lp-NN): <summary>`, on `claude/punchthis-launch`. Never mix tasks in one commit.
3. **Blocker rule:** if a task is genuinely blocked, record BLOCKED + exact reason in LAUNCH_STATUS.md, skip to the next task **only if independent of the blocked one**, and never bypass with a placeholder or fake. Continue the batch.
4. **Dependency rule:** the only new dependency permitted in this batch is `jszip` (LP-05). Any other dependency you believe is required → treat as a blocker for that task and record why.
5. **Scope rule:** acceptance criteria live in `LAUNCH_MASTER_PLAN.md` under each LP ID — re-read them before each task. No scope creep; no redesigns; marketing website untouchable; protected files untouchable.
6. **After the final task:** produce the batch report — per task: behaviour changed · files changed · tests run · build result · visual evidence · remaining risks · commit hash · status. Then stop and return control to Claude. Never push.

---

### TASK LP-02 — Remove dead Voice control + remove unfinished Sync Centre surface

**Problem.** Two production surfaces promise features that do not exist. (1) The capture screen's Voice button (`expo/app/capture-session.tsx:344-352`) only shows "coming in a future update". (2) The Sync Centre screen (`expo/app/sync.tsx`, 112 lines) is entirely future promises — "Cloud backup and multi-device sync are coming in a future update", a "Pending for future sync" outbox count, and a wifi-only preference toggle for a feature that does not exist — reached from a Settings row whose subtitle is "All work saved on device · N records pending future sync" (`expo/app/(tabs)/settings.tsx:209`). Gate A requires no dead primary controls and no unsupported claims.

**Scope.**
1. Remove the Voice `TouchableOpacity` block from `capture-session.tsx` entirely (including now-unused `Mic` import and any orphaned styles). Verify the side-button column layout still balances at 390×844 — adjust spacing only as needed, no redesign.
2. Delete `expo/app/sync.tsx` and remove the Settings row that links to it. Replace that Settings row with nothing (the storage/data section already communicates local-first; LP-04 will add the full approved wording). Remove any `router.push`/link references to the sync route (grep for `"/sync"` and `sync` route usages) so no dead route remains; typedRoutes will catch strays in typecheck.
3. Trim remaining future-promise copy in Settings: `settings.tsx:277-278` "Cloud backup, multi-device sync and web access arrive in a future update." → replace with a plain local-first statement, e.g. "Local-first: everything is stored on this device." (exact approved long-form wording lands in LP-04 — keep this minimal and factual, promise nothing).
4. Do NOT touch `lib/persistence/*`, the outbox logic, or `syncStatus` fields — they are architecture (root ARCHITECTURE.md §2), not UI. Only UI surfaces go.
5. If any test references the sync screen or Voice control, update it. Add no new tests unless behaviour logic changed (this is removal-only).

**Out of scope:** the pendingCount computation and outbox internals; Settings restructure (LP-04); any new wording beyond the minimal factual line; capture-screen redesign. **`SyncPill` (`components/pills.tsx:42`) STAYS** — it truthfully shows "On device"/"Synced" and never promises a future feature.

**Acceptance criteria:** master plan LP-02 list, plus: `grep -rn "future update" expo/app expo/components` returns nothing user-visible; no route or link to a sync screen; Voice absent from capture; typedRoutes strays caught via `typecheck`; capture + settings screens verified in web preview at 390×844.

---

### TASK LP-07 — GitHub Actions CI

**Problem.** No `.github/workflows/` exists anywhere in the repo. Strong test discipline exists (157 tests) but nothing enforces it on merges.

**Implement:**
1. Create `.github/workflows/ci.yml` at the **repo root** (not under `expo/`). Trigger on `pull_request` targeting `main` and `push` to `main` and `claude/punchthis-launch`. Add a `concurrency` group cancelling superseded runs, and `timeout-minutes: 20`.
2. Single job on `ubuntu-latest`, `defaults.run.working-directory: expo`: checkout → `oven-sh/setup-bun@v2` → `bun install --frozen-lockfile` (bun.lock is authoritative, root DECISIONS #5) → `bun run typecheck` → `bun run lint` → `bun run test` → `bun run build:web`. Real commands only — identical to local; **no placeholder or `|| true` steps.**
3. If `--frozen-lockfile` fails against the current lockfile state, fix the lockfile honestly (commit the regenerated lock in the same task) rather than dropping the flag.
4. Validate the workflow file: run `actionlint` if available on this machine; otherwise re-read the YAML against GitHub's schema carefully (indentation, `on:` shape, working-directory spelling).

**Out of scope:** publishing/deploy jobs, native builds, caching optimisations, branch-protection settings (GitHub UI — operator/Claude).

**Acceptance criteria:** master plan LP-07 list; every CI step proven by running the identical command locally in this batch; YAML validated; honest note in LAUNCH_STATUS that green-on-GitHub is unverifiable until the branch is pushed (Claude/operator step).

---

### TASK LP-03 — Repair sample data (bundled matching photos, sample labels, device-locale dates)

**Problem.** `lib/seed.ts:41-51` seeds issue photos from random remote stock URLs (Unsplash/picsum), so evidence cannot match issue titles — the review's worst trust defect is seeded issue #008 "Temporary switchboard unsecured — signage non-compliant" rendering an American flag. Demo data also isn't labelled as sample content, and the default audit title uses US date format while the date field shows ISO (`app/audit-new.tsx`), on top of an AU-address seed. Operator decision L10: fix dates **via device locale**, never by hardcoding an AU format.

**Implement:**
1. **Generated, licence-clear-by-construction seed images.** Add `scripts/generate-seed-photos.mjs` (follow the existing `scripts/generate-brand-assets.mjs` pattern) producing one 1200×900 JPEG per seeded issue (8: paint scuffing lobby wall, sealant shower junction, exposed cabling ceiling grid, door hardware Unit 104, membrane blistering roof terrace, line marking visitor bays, corridor skirting lift lobby, temporary switchboard signage) plus one cover image. Each image: neutral construction-toned backdrop, a simple large glyph/shape evoking the issue, the issue's short label, and a clearly visible "SAMPLE" watermark. Commit both the script and the generated files under `expo/assets/seed/`. Target ≤150KB per image. If you can instead source real CC0/verifiably-licensed photos that genuinely match each issue, that is allowed — but a labelled generated image ALWAYS beats a mismatched real photo, and licence proof must be recorded in the task report.
2. **Seed through the real media pipeline.** At seed time, copy each bundled asset into `PHOTO_DIR` (via `expo-asset` localUri + `expo-file-system` copy on native; on web produce data URIs consistent with the A6 web pipeline) and store normal asset records pointing at those copies — so seeded media flows through the exact same markup/report/GC/wipe machinery as user photos, with **zero special-casing downstream** and no remote fetches ever. Keep seeding resilient (a failed copy must not crash first launch; skip that photo honestly).
3. **Sample labelling.** Seed project name → "Sample — Harbourview Apartments Stage 2"; preparedFor → "Meridian Property Group (sample)"; keep all names obviously fictional. The audit title stays realistic but the project-level "Sample" must be visible on Home and in the report header.
4. **Device-locale dates.** New `lib/dates.ts` with `formatShortDate(date)` (and any sibling helpers) using `Intl.DateTimeFormat(undefined, …)` with a safe fallback if Intl is unavailable on the target engine. Use it for the default audit title in `app/audit-new.tsx` (fixing the US-vs-ISO mismatch) and in seeded strings. Seed dates become relative to now (e.g. capture times a few days back) so the demo never looks stale.
5. **Theme/title coherence.** Seeded audit "Pre-Handover Site Walk" must default to the Site Walk report theme, not Executive.
6. **Tests.** `lib/__tests__/seed.test.ts` (or extend): no `http` URLs anywhere in seeded data; every seeded asset references the bundled set; project name contains "Sample"; theme/title coherence. Plus `lib/__tests__/dates.test.ts` for the locale helper (mock locales).

**Out of scope:** onboarding flows (LP-20), reseed UX changes beyond data content, marketing screenshots.

**Acceptance criteria:** master plan LP-03 list; fresh reseed in web preview shows matching sample-labelled evidence on every issue including #008; zero remote requests during seed (verify network tab); dates render from device locale.

---

### TASK LP-04 — About, support, and data-safety surfaces (provisional wording)

**Problem.** Settings/About has no version/build, publisher, support contact, privacy/terms/data screens, or storage honesty beyond one subtle line. Gate A requires a support path and a prominent, honest local-storage warning (operator decisions L9, L13; approved draft wording is in `PUNCHTHIS_FULL_APP_REVIEW.md` §"Recommended in-app/store wording" — use it verbatim).

**Implement:**
1. **Single copy module** `lib/legalCopy.ts` exporting named constants: `PRODUCT_SCOPE`, `LOCAL_STORAGE_WARNING`, `CAMERA_PHOTOS`, `BLUR_REDACTION`, `RETENTION_DELETION` (must describe actual behaviour incl. LP-01: clearing data immediately deletes records and owned photo/report/brand files; exports/shares the user sent are outside the app's control), `EXPORT_SHARING`, `REPORT_FOOTER_NOTE`, `PROVISIONAL_NOTICE` ("Provisional wording pending legal review."), `SUPPORT_EMAIL`, `PUBLISHER_NAME`, and `buildSupportMailto(version)` (subject "PunchThis support — v{version}"). Interim values: `SUPPORT_EMAIL = "henrysestak@gmail.com"` and `PUBLISHER_NAME = "Henry Sestak"` — both are **provisional, taken from the repo owner identity; flag them prominently in the batch report for operator confirmation. Do not invent anything else.**
2. **Data & privacy screen** — new route `app/data-privacy.tsx`: provisional-notice banner at top, then sections rendering the copy modules (existing `SectionTitle`/`Card` primitives, theme tokens). Reachable from Settings.
3. **Settings About card** gains: app version from `expo-constants` (`Constants.expoConfig?.version`) + a `BUILD_ID` constant (date-stamped, defined in `lib/legalCopy.ts`), publisher line, "Data & privacy" link row, "Contact support" row opening `buildSupportMailto` via `Linking` (works on web as mailto).
4. **First-run storage notice.** One-time dismissible Card on Home: short `LOCAL_STORAGE_WARNING` + "Learn more" → Data & privacy. Dismissal persists in settings (e.g. `storageNoticeDismissedAt`; extend `AppSettings` + `DEFAULT_SETTINGS` compatibly — no migration needed for an optional field, verify hydration of pre-existing settings). This answers the review's "'On device' is too subtle".
5. **No forbidden claims.** Nothing may say or imply cloud backup, encryption, secure storage, or guaranteed retention. New surfaces get correct a11y roles/labels (they will be re-checked in LP-06).
6. **Tests:** copy constants exist/non-empty; `buildSupportMailto` output; a wording-honesty test asserting the copy module contains no banned phrases ("cloud backup", "encrypted", "secure storage", "guaranteed").

**Out of scope:** public web pages (LP-12, Claude), store metadata (LP-08), legal finalisation (EXT-4), Settings visual redesign.

**Acceptance criteria:** master plan LP-04 list; every surface reachable from Settings in web preview; version renders correctly; mailto opens with version in subject; first-run notice appears on fresh data, dismisses, and stays dismissed across reload.

---

### TASK LP-05 — Export-all safety archive (archival, not restore)

**Problem.** Before anyone relies on PunchThis for recordkeeping there must be a way to get everything out. Gate A ships **one archive export**, explicitly archival (no in-app restore — decision, master plan LP-05).

**Implement:**
1. Add dependency `jszip` (pure JS — the one permitted new dep).
2. `lib/exportArchive.ts`:
   - `buildExportManifest(db, settings)` — pure, tested: `{ formatVersion: 1, appVersion, createdAt, counts per table, media: [{ id, role, filename, sourceUri }], skipped: [] }`.
   - `exportAllData(db, settings, onProgress)` — builds a zip: `manifest.json`, `records/<table>.json` for every table, `settings.json`, and `media/` containing every referenced file (asset original/report/thumb where distinct, generated report PDFs, brand logo). Native: read files as base64 via `expo-file-system/legacy` sequentially (no parallel reads — memory), add to zip, write final zip to `cacheDirectory` as `punchthis-export-<YYYYMMDD-HHmm>.zip`, then share via `expo-sharing` (`Sharing.isAvailableAsync()` guard, mimeType `application/zip` — same pattern as `app/audit/[id]/preview.tsx:278`). Web: decode data-URI media into real zip entries, produce a Blob, trigger an anchor download.
   - Missing/unreadable file → record in `manifest.skipped` with reason and continue; **never silently omit**. Any failure → honest dialog via `lib/dialogs.ts`; clean up the temp zip on failure; no partial-success claims.
3. **UI:** Settings Storage section row "Export all data" with sub-copy stating exactly what's included and that the archive is for backup/records — **not restorable in-app**. Progress states through the phases (mirror the PDF generation progress pattern). Success dialog states where it went (share sheet / download) + archival wording.
4. **Docs:** `docs/launch/EXPORT_FORMAT.md` — structure, versioning rules (formatVersion bumps), and the explicit non-goal of in-app restore.
5. **Tests:** manifest builder (counts, media list, skipped population); orchestration with mocked FS + JSZip (sequential adds, zip named correctly, failure path cleans up); wording test (sub-copy says archival/not restorable).
6. **Scale honesty:** process sequentially; test with the largest data you can synthesise in the preview; record the practical size ceiling you observed in the batch report and LAUNCH_STATUS (JSZip holds the archive in memory — a real limit, state it, don't hide it).

**Out of scope:** in-app restore/import, cloud anything, per-project selective export (future), auto-scheduled backups.

**Acceptance criteria:** master plan LP-05 list; web preview: export produces a downloadable zip whose contents match the manifest against seeded data; interrupted/failed export shows honest dialog and leaves no half-written state visible as success.

---

### TASK LP-06 — Accessibility: shared primitives, states, contrast

**Problem.** Review: shared primitives expose almost no roles/labels/states; `Field` claims invalid-state a11y it doesn't implement; contrast failures for `#96A0A9` (2.66:1) and `#4C82FF` (3.53:1) and `#E5A016` (2.24:1) on light backgrounds; markup toolbar is icon-and-colour-only. This is the Gate A web-scope bar (decision L8): primitives + states + AA contrast + web keyboard journey. Native screen-reader passes ride LP-09.

**Implement:**
1. **Primitives first** — `components/ui.tsx` (`AppButton`, `Field`, `Chip`, `ToggleRow`, `Segmented`, `EmptyState`, `Card`, `SectionTitle`), `components/pills.tsx` (all three pills), `components/ActionSheet.tsx`, `IssueCard`, `ProjectCard`: correct `accessibilityRole` (button/switch/radio/tab/text as appropriate), `accessibilityLabel` (icon-only controls get text labels), `accessibilityState` (`selected`/`checked`/`disabled`/`busy`), `accessibilityValue` where a value exists (Segmented). `Field`: label association, and on error set `accessibilityState`-appropriate signalling + include the error in the field's accessible label/hint so the claim in its comment becomes true.
2. **Journey screens** — capture controls (shutter, gallery, done), markup toolbar (every tool/colour/stroke/undo/redo/rotate/erase gets a label + selected state), report builder toggles (inherit from `ToggleRow`/`Segmented`), destructive confirmations (`ActionSheet` items: role + destructive announced in label).
3. **Announcements** — save success/failure announced via `AccessibilityInfo.announceForAccessibility` (markup save, capture save toast, persistence failure); `StorageErrorBanner` becomes a live region on web (`accessibilityLiveRegion`/`role="alert"` mapping).
4. **Contrast tokens** (`constants/theme.ts`) — fix by *usage context*, computationally verified:
   - `textFaint #96A0A9`: darken for light surfaces to ≥4.5:1; it is also used on dark (e.g. capture screen) — if no single value passes both contexts, split into `textFaintOnLight`/`textFaintOnDark` and update usages accordingly.
   - `cobalt #4C82FF` as **text/link on light** → new `cobaltText` (≥4.5:1, e.g. ≈`#2D5FE3` family) and switch text usages to it; cobalt stays for fills. White label on cobalt fill in `AppButton`: compute it; if `<4.5:1` for the actual label size/weight, darken the primary fill until the label passes (flag the visual shift in the report).
   - `amber #E5A016` as text on light → new `amberText` (≥4.5:1); amber stays for fills/pills with dark label if that pair passes.
5. **Regression-proof it** — new `lib/contrast.ts` (relative-luminance + WCAG ratio) with `lib/__tests__/contrast.test.ts` asserting every text-role token pair actually used (enumerate the pairs you fixed) meets ≥4.5:1 (or documented ≥3:1 large-text exceptions with the size/weight justification inline).
6. **Web keyboard journey** — verify Tab/Enter/Space drive: Home → New Project → create → New Audit → (skip camera on web) add gallery photo → issue sheet → save → hit list → report → generate. ActionSheet must be focusable and Escape-dismissable on web.
7. **Status-not-colour-alone** — verify pills/badges pair colour with text everywhere (they mostly do; fix any colour-only instance found).

**Out of scope:** native VoiceOver/TalkBack passes (LP-09), 200%-text full sweep (spot-check core journey only), redesigning layouts.

**Acceptance criteria:** master plan LP-06 list; contrast test suite green with real computed ratios; keyboard journey completes in web preview; every touched control exposes role+label+state (verify via the browser accessibility tree — it should stop being empty).
