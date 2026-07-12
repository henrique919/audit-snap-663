# ROADMAP.md — Launch Readiness

## PROGRESS

| Done | In Progress | Remaining |
|------|-------------|-----------|
| 5    | 0           | 7 (Category A) |

> Phase 2 (Sonnet 5): update this table and the per-item checkboxes as you complete items.
> Process items **strictly in order** A1 → A12 per EXECUTION_PLAYBOOK.md.

---

## CATEGORY A — EXECUTABLE NOW (priority order)

### A1. Cross-platform dialog layer (unblocks everything else) — **M**
- [x] Done — `expo/lib/dialogs.ts` (showAlert/showConfirm/showActions) + `expo/components/ActionSheet.tsx` host mounted in `_layout.tsx`. All 32 `Alert.alert` call sites converted across 10 files (grep confirms zero remain in app/components); also removed one pre-existing dead `Alert` import in `app/project/[id].tsx`. Added an `onMore` kebab-button trigger on `IssueCard` alongside the existing `onLongPress`, since mouse-hold long-press is unreliable for both real desktop users and automated web testing. 11 new unit tests in `lib/__tests__/dialogs.test.ts` (native Alert delegation, web window.alert/confirm, ActionSheet listener wiring). Verified live in web preview: hit-list kebab → action sheet → Delete → window.confirm → issue removed (localStorage confirmed); New Audit empty-title → window.alert fires, no navigation. `tsc --noEmit` clean, lint clean (only 2 pre-existing unrelated warnings in markup/[assetId].tsx), 91/91 tests pass.
**Problem:** `Alert.alert` is a no-op on react-native-web. ~24 call sites (confirmations, quick-action menus, validation, error reporting) silently do nothing on web — including the failure path of PDF generation. Web is the Phase 2 verification surface, so this lands first.
**Description:** Create `expo/lib/dialogs.ts` exporting `showAlert(title, message?)`, `showConfirm(title, message, confirmLabel, destructive?) → Promise<boolean>`, and `showActions(title, message, actions: {text, style?, onPress}[])`. Native: delegate to `Alert.alert` unchanged. Web: `window.alert` / `window.confirm` for the first two; for `showActions` build a minimal RN `Modal` action-sheet component (`expo/components/ActionSheet.tsx`) styled with existing `constants/theme.ts` tokens (web + native can share it; native may keep Alert). Replace every `Alert.alert` import/call in `app/` and `components/` with the shim (grep `Alert.alert`; files include `capture-session.tsx`, `audit/[id]/hitlist.tsx`, `audit/[id]/preview.tsx`, `markup/[assetId].tsx`, `issue/[id].tsx`, `(tabs)/settings.tsx`, `sync.tsx`, `audit-new.tsx`, `project-new.tsx`).
**Acceptance criteria (web preview):**
1. Hit list → long-press (or the web fallback trigger you implement) an issue → quick-actions sheet appears; "Delete" asks for confirmation; confirming removes the issue from the list.
2. New Audit with empty title → visible "Audit title required" message (dialog or inline), not silence.
3. `grep -rn "Alert.alert" expo/app expo/components` returns only the shim (or zero direct call sites).
4. All 80+ existing tests still pass.

### A2. Web-safe report export — **M**
- [x] Done — confirmed `expo-print`'s web shim ignores `html` and just calls `window.print()` on the current page, so a real print target must be a separate window. New `expo/lib/reportPrintWeb.ts` opens a blank window synchronously (before any await, for popup-blocker survival) and writes the built report HTML into it once ready, triggering its print dialog (13 new unit tests). `preview.tsx generate()` branches at the print step only — native calls `Print.printToFileAsync` + `persistGeneratedPdf` exactly as before (byte-identical); web writes into the pre-opened window and records a `ReportExport` with sentinel `pdfUri: "web-print"` (decision + rationale in DECISIONS.md #10). `withFreshPdf` always regenerates on web instead of attempting stale-reuse; `doShare`'s old dead-end alert removed since generate() already handled printing; `doEmail` needed no changes (its web branch already opens a working `mailto:` composer). Popup-blocked treated as a first-class, non-destructive failure path (`showAlert`, zero side effects, verified for real — automation clicks aren't trusted gestures in browsers, confirmed empirically, technique documented in EXECUTION_PLAYBOOK §4.6). Verified live in web preview via a fake `window.open` capturing the actual generated HTML: contains cover markup, hit-list table, and the SVG arrow annotation overlay (32KB real HTML, not a stub); Generate/Share/Email all independently confirmed working (3 ReportExport records, correct mailto subject/body); real popup-blocked path separately confirmed (alert fires, 0 records). `tsc --noEmit` clean, lint clean (same 2 pre-existing warnings), 99/99 tests pass.
**Problem:** On web, `Print.printToFileAsync` is unsupported → TypeError → silent failure (STATUS §3.1).
**Description:** In `expo/app/audit/[id]/preview.tsx` `generate()`: on `Platform.OS === "web"`, skip printToFileAsync; instead call `Print.printAsync({ html })` (opens the browser print dialog → user saves as PDF), or open the report HTML in a new window (`window.open` + `document.write` + `window.print()`) if `printAsync` proves unreliable. Do not record a `ReportExport` row with a fake pdfUri on web — either record with `pdfUri: "web-print"` sentinel and hide Share/Email accordingly, or skip the record; pick one, note it in DECISIONS.md. Keep the native path byte-identical. Failure paths must use `lib/dialogs.ts` (A1).
**Acceptance criteria (web preview):**
1. PDF Preview → Generate PDF opens a print dialog or a printable report view showing cover + hit list + item pages with the arrow annotation overlay visible on issue #001's photo.
2. No `TypeError` in console; a forced failure (temporarily throw) shows a visible dialog.
3. Native code path unchanged (diff review) and tests pass.

### A3. Merge the dangling durability fix — **S**
- [x] Done — cherry-picked `20d59277a` ("Preserve pending writes across retry failures") from `hardening/data-durability` cleanly, zero conflicts (touches `AppStore.tsx`/`StorageErrorBanner.tsx`, neither modified by A1/A2). Adds `lib/persistence/pendingWrite.ts` `mergeFailedWrite`: fixes a real race where a failed persist retry could silently overwrite a NEWER pending snapshot (queued while the failed batch was retrying) with the older failed one, discarding the newer mutation; also unions both attempts' dirty-table sets so nothing drops. `StorageErrorBanner` now dismisses per a monotonic `persistFailureVersion` counter instead of string-equality on the error message, fixing the case where two distinct failures with identical wording would leave the banner stuck dismissed after the first. `tsc --noEmit` clean, 101/101 tests pass (incl. both new `pendingWrite.test.ts` cases), lint clean (same 2 pre-existing warnings). Verified live in web preview post-cherry-pick: app boots correctly (screenshot + `get_page_text` show correct computed provider state, no error-boundary fallback, no StorageErrorBanner), a live settings mutation round-trips through the updated `flushPersist`/`markPersistFailure` path into localStorage correctly. Note: a stale Fast-Refresh console artifact from the mid-session hot-reload transition (see EXECUTION_PLAYBOOK §4.4) was investigated and ruled out as a live issue — documented so it isn't misread as a regression later.
**Description:** `git fetch origin && git cherry-pick 20d5927` ("Preserve pending writes across retry failures", branch `hardening/data-durability`). Resolve conflicts if any (touches `StorageErrorBanner.tsx`, `providers/AppStore.tsx`, adds `lib/persistence/pendingWrite.ts` + test).
**Acceptance criteria:** cherry-pick applied; `bun run test` green including `pendingWrite.test.ts`; typecheck clean; app boots in web preview with no banner regressions.

### A4. Truthful save-state labels — **S**
- [x] Done — extracted pure `expo/lib/saveState.ts` (`saveIndicatorState`, `SAVE_INDICATOR_LABEL`, `savedToastMessage`): a persistence error always wins over local saving/dirty state. Wired into markup's header (`persistStatus === "error"` → "Save issue — see banner", red, overriding the local saved/dirty/saving display) and capture-session's save toast (checks `persistStatus` at save time; won't claim "saved on device" if a persistence failure is already ongoing). 11 new unit tests, including the exact regression this fixes: error state wins even when local state looks clean or is mid-save. Zero changes needed to `AppStore.tsx`/`lib/persistence/*` (out of scope per playbook, and correctly unnecessary — the signal it already exposes is sound). `tsc --noEmit` clean, 112/112 tests pass, lint clean (same 2 pre-existing warnings).

  **Verification note:** live-tested the failure path by forcibly throwing from `localStorage.setItem` and confirmed via direct instrumentation that `persistStatus`/`lastPersistError`/`persistFailureVersion` genuinely transition correctly on write failure (the same context-read pattern already renders correctly elsewhere — StorageErrorBanner showed correctly for an equivalent settings-mutation failure). Could not capture a single stable live screenshot of markup's error state specifically, because of an environment-only artifact: `AppState` oscillates every ~200ms in this headless browser (see DECISIONS.md #13, EXECUTION_PLAYBOOK §4.4), continuously re-triggering retries on the already-failing write and never letting "error" be the settled render. This is unrelated to the UI code being added here — confirmed not a live device/browser behavior. Confidence in this item is high based on unit tests + the ground-truth state instrumentation, not a stable screenshot.
**Problem:** Markup "Saved on device" (`markup/[assetId].tsx` ~line 992) and the capture toast ("#NNN saved on device") reflect local state only, contradicting the StorageErrorBanner on write failure.
**Description:** `useAppStore()` already exposes `persistStatus`/`lastPersistError`. In markup: when `persistStatus === "error"`, show "Save issue — see banner" (amber) instead of "Saved on device". In capture: append toast wording only after checking `persistStatus !== "error"`, else show "Saved — sync to storage failed" variant.
**Acceptance criteria:** Add a dev-only forced-failure hook (e.g. `setStorageDriver` with a failing driver behind `__DEV__` toggle in Settings, or a unit test at minimum) demonstrating: on write failure the markup header does NOT claim "Saved on device". Normal path unchanged in web preview.

### A5. Automatic media GC sweep on startup — **S**
- [x] Done — new `expo/components/MediaGcScheduler.tsx`, mounted in `_layout.tsx` alongside `StorageErrorBanner`/`ActionSheetHost` (the established pattern for provider-scoped, UI-less side-effect components). Guard order: `hydrated` (from `useAppStore()`) → 5s `setTimeout` → `runMediaGc`, gated by a `ranRef` so it fires at most once per app launch. `db`/`settings` are read via refs updated every render (not effect dependencies) specifically so a routine mutation during the 5s window can't cancel-and-drop the pending timer — the effect itself depends only on `[hydrated]`, which changes exactly once. Explicit `console.log` on both the web-skip and native-ran/failed paths so the outcome is always observable, not just relying on `runMediaGc`'s own internal web no-op. `tsc --noEmit` clean, 112/112 tests pass (`mediaRegistry.test.ts` untouched/green), lint clean. Verified live: fresh web boot shows `[media-gc] startup sweep skipped (web)`, zero console errors, home screen renders normally.
**Description:** After hydration completes in `providers/AppStore.tsx` (or `app/_layout.tsx`), schedule `runMediaGc(db, settings)` once per app launch on native (`Platform.OS !== "web"`), ≥5s after interactive, fire-and-forget with try/catch, log result. Respect existing 24h age gate; never run before hydration.
**Acceptance criteria:** Code-reviewed guard order (hydrated → delay → GC). On web preview boot: no crash, a log line confirming sweep skipped (web) or ran. `mediaRegistry` tests still green.

### A6. Real web capture pipeline (dims + persistence) — **M**
- [ ] Done
**Problem:** `expo/lib/files.ts` web branch fakes 1600×1200 dims and passes through blob URIs that die on reload — web-added photos render at wrong aspect and vanish.
**Description:** On web in `processPickedPhoto`: read actual dimensions (create `Image`, await load or `createImageBitmap`), downscale via canvas to ≤1800px, export JPEG data URI (quality ~0.72) for `reportUri`/`thumbUri` (≤500px thumb). Store data URIs (they persist in localStorage-backed records; keep sizes modest). Keep native branch untouched.
**Acceptance criteria (web preview):**
1. Capture Session → Gallery → programmatically inject a test image file into the `<input type=file>` (technique in EXECUTION_PLAYBOOK §4.5) → issue sheet shows the photo; save issue.
2. The photo renders with correct aspect ratio in hit list, markup studio, and report preview; after a full page reload it still renders.

### A7. Form validation states (audit-new, project-new, issue sheet) — **M**
- [ ] Done
**Description:** Inline validation (not dialog-only): required-field highlight + helper text for Audit Title (`audit-new.tsx`), Project Name (`project-new.tsx`); sensible maxLengths (title 120, names 80, description 2000); trim-on-save everywhere (several sites already trim — make consistent). Keep the existing auto-title fallback for the capture issue sheet (it is a feature, not a bug).
**Acceptance criteria (web preview):** Submitting audit-new/project-new with empty required fields shows an inline error state on the field AND does not navigate; filling it clears the error; typing 121st char in title is prevented.

### A8. Console hygiene: deprecation warnings — **S**
- [ ] Done
**Description:** Replace `shadow*` style props in `expo/constants/theme.ts` (and any inline uses) with `boxShadow` on web via `Platform.select` (RN 0.81 supports `boxShadow` string style on new-arch native too — verify on web preview only; keep native shadows working by retaining elevation/shadow props under `Platform.select({ default: ... })` if needed). Migrate `props.pointerEvents` → `style.pointerEvents` (grep `pointerEvents=`).
**Acceptance criteria:** Web preview console shows zero `shadow*`/`pointerEvents` deprecation warnings across home → markup → preview walk; visual shadows unchanged (screenshot compare home + capture screens).

### A9. Reports tab end-to-end verification & repair — **S**
- [ ] Done
**Description:** `expo/app/(tabs)/reports.tsx` was not runtime-verified in Phase 1. Walk it in web preview: it should list generated report exports with open/share affordances. Fix whatever is broken on web (likely Share/`Sharing` guards and stale `pdfUri` handling after A2's web sentinel decision).
**Acceptance criteria:** Reports tab renders the export history for the demo audit after generating a report (A2 path); tapping an entry produces a sensible web behavior (re-open print view or an informative dialog); no console errors.

### A10. Empty/edge-state sweep — **S**
- [ ] Done
**Description:** Verify + fix: report generation with 0 included issues (guard with dialog "No issues included — check report options"); audit with issues but all photos deleted; very long titles/descriptions in hit list, report HTML (escape + wrap verified by existing tests, check UI truncation); project with no audits; search with no matches.
**Acceptance criteria:** Each listed state renders a designed empty/guard state in web preview, no blank screens, no console errors.

### A11. Capture gallery multi-select processing feedback — **S**
- [ ] Done
**Description:** `capture-session.tsx` processes gallery picks serially with one spinner. Add bounded concurrency (2) + progress text ("Processing 3/6…") reusing the pattern from `reportImages.ts`. Native benefits; web after A6.
**Acceptance criteria:** Web preview with 3 injected files shows progressive feedback and opens the sheet with 3 thumbnails; unit test for the bounded processor if extracted as a helper.

### A12. Entitlement stub + CSV export (last, small features) — **M**
- [ ] Done
**Description:** (a) Create `expo/lib/entitlements.ts` per ARCHITECTURE.md §3 (local stub, everything unlocked, single `isEntitled(feature)` gate; no UI). (b) CSV export of the hit list: `expo/lib/csv.ts` building RFC-4180 CSV from issues (number, title, location, assignee, status, priority, created, description) + share/download (web: Blob + anchor download; native: share sheet via expo-sharing with a temp file). Add "Export CSV" to the hit list or report builder. Gate it behind `isEntitled("csv_export")` (returns true) as the first real entitlement consumer.
**Acceptance criteria (web preview):** Export CSV downloads a file whose contents open correctly (verify header row + 8 demo rows, quoted commas in descriptions); unit test for `buildCsv` incl. quote/comma/newline escaping; entitlement check present in the code path.

---

## CATEGORY B — EXTERNALLY BLOCKED (do not start; keep slots clean per ARCHITECTURE.md)

| Item | Blocked by | Prepared slot |
|---|---|---|
| B1. Cloud backup & multi-device sync | Backend infra decision (Supabase/PowerSync), accounts | `StorageDriver` + outbox + syncStatus fields (ARCHITECTURE §2) |
| B2. Per-assignee closeout links / contractor flow | B1 + web hosting | Report engine already groups by assignee |
| B3. Monetization / IAP / paywall | Store accounts, pricing decision | `lib/entitlements.ts` stub (A12) |
| B4. App Store / Play submission | Apple Developer + Play Console licenses; bundle IDs are `app.rork.fsowpwobeaoqe5smtpb03` placeholders | ARCHITECTURE §4 rename checklist |
| B5. Final app name | Trademark/domain/store checks. **Shortlist:** 1. Snagline · 2. Fieldproof · 3. SiteMark · 4. Walkdown · 5. Closeout | One-file rename (+app.json) per ARCHITECTURE §4 |
| B6. Final brand assets (icon/splash/logo) | Brand design | Placeholder specs in ARCHITECTURE §5 |
| B7. Voice-to-issue capture | Speech API/model decision (cloud key or on-device) | Dead button already placed in capture UI |
| B8. AI defect tagging/description | LLM API key + cost decision | Hook point: `openDraft` in capture-session |
| B9. GPS photo evidence | Physical-device permission testing | `expo-location` already a dependency |
| B10. SQLite migration | None technically — **deliberately deferred** to avoid destabilizing launch; requires device-matrix testing | Driver swap per `expo/lib/persistence/README.md` |
| B11. Signature capture, due dates, assignee manager UI | Product decisions; native testing | Model fields already exist for assignees |

---

## BLOCKED (moved from Category A during Phase 2, with reasons)

_(empty — Phase 2 appends here per EXECUTION_PLAYBOOK rules)_
