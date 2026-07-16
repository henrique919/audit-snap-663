# STATUS.md — Repository Status at Phase 1 Handoff

**Repo:** henrique919/audit-snap-663 · **HEAD at review:** `e0c5a86` (local clone: `C:\Users\Harry\Downloads\prymd\audit-snap-663`)
**App:** "Clean Audit IQ" (working title) — Expo SDK 54 / RN 0.81 / React 19 / expo-router 6 / TypeScript, under `expo/`.
**Reviewed:** 2026-07-12 by Fable 5 (Phase 1). Static analysis of every core module + live web-preview walk of the four core flows.

## 1. Verification results (run on this machine)

| Check | Result |
|---|---|
| `bun install` | ✅ 1139 packages |
| `./node_modules/.bin/tsc.exe --noEmit` | ✅ clean |
| `bun run test` (jest-expo) | ✅ 13 suites, 80 tests, all pass |
| Expo web preview (`npx expo start --web --port 8091`) | ✅ boots, bundles (2729 modules), app renders |

## 2. What exists and works (verified at runtime in web preview)

- **Home / demo seed** — first launch seeds a full demo project (`expo/lib/seed.ts`), renders project cards, "Continue last audit", search. No console errors.
- **Create audit flow** — Project → Start New Audit → form with smart defaults (date=today, preparedFor=client, inspector) → Start Capture creates the audit, opens Capture Session, and persists (verified in `localStorage caiq:audits`). `expo/app/audit-new.tsx`.
- **Capture Session screen** — renders with issue count, sticky location/assignee chips, "Saved locally" indicator. `expo/app/capture-session.tsx`.
- **Markup Studio** — full toolbar (Select/Arrow/Circle/Box/Pen/Text/Number/Blur/Crop), color+size bars, undo/redo. Drew an arrow with mouse events, selection chrome + object bar appeared, Save persisted the annotation (verified in `caiq:annotations`), state returned to "Saved on device". `expo/app/markup/[assetId].tsx`.
- **Hit List** — renders, filters, empty state ("No issues yet") correct for a fresh audit. Uses O(1) media index from Wave 1 (`expo/lib/issueIndex.ts`).
- **Report Builder & PDF Preview** — all sections/toggles render; page-numbers toggle correctly removed (Wave 1); preview shows cover, stats, hit-list and item previews, privacy-redaction note. `expo/app/audit/[id]/report.tsx`, `expo/app/audit/[id]/preview.tsx`.
- **Settings** — inspector defaults, report branding, Sync Centre link, **Storage section with "Clean up unused files"** (Wave 1 media GC), reset/clear data. `expo/app/(tabs)/settings.tsx`.
- **Wave 1 hardening — all four PRs merged and effective:**
  - Persistence: driver boundary + retry + result types + dirty tables (`expo/lib/persistence/*`, `expo/lib/store.ts`), StorageErrorBanner mounted in `expo/app/_layout.tsx`, AppState background flush, outbox compaction (no 200-cap anywhere).
  - PDF: bounded concurrency ≤3 (`expo/lib/reportImages.ts`), Google-Fonts `@import` removed (system stacks, rationale in `expo/lib/reportFonts.ts`), generation progress phases + large-report error classification (`preview.tsx`).
  - Media: deletion helpers + draft-discard cleanup + supersede-on-replace + orphan GC with 24h age gate (`expo/lib/files.ts`, `expo/lib/mediaRegistry.ts`).
  - Tests: jest-expo harness + 80 tests incl. geometry, SVG redaction, outbox, GC safety (`expo/jest.config.js`, `expo/lib/__tests__/`, `expo/lib/persistence/__tests__/`).

## 3. What is broken (observed defects, highest severity first)

1. **PDF generation fails SILENTLY on web.** `Print.printToFileAsync` is unsupported on web → `result.uri` TypeError (observed in console) → catch calls `Alert.alert` → **`Alert.alert` is a no-op in react-native-web** → user sees the spinner stop and nothing else. `expo/app/audit/[id]/preview.tsx` `generate()` (~line 136 `printToFileAsync`). Roadmap A2.
2. **`Alert.alert` no-op on web breaks ~24 interaction sites.** All destructive confirmations (delete issue, clear markup, discard draft), the hit-list long-press quick-actions menu (`expo/app/audit/[id]/hitlist.tsx` `quickActions`), status-change menu, stale-report regeneration prompt (`preview.tsx` `withFreshPdf`), and form validation ("Audit title required", `expo/app/audit-new.tsx:52`) silently do nothing on web. Native is unaffected, but web is Phase 2's verification surface. Roadmap A1 (must land first).
3. **Unmerged durability fix.** Remote branch `hardening/data-durability` has one commit past main: `20d5927` "Preserve pending writes across retry failures" (pendingWrite merge helper + banner dismiss-versioning). Roadmap A3.
4. **"Saved on device" labels not gated on persistence status.** The markup save-state line (`expo/app/markup/[assetId].tsx:992`) and capture toast (`capture-session.tsx` `showSavedToast`) show success based on local state only; a failed write shows the banner AND "Saved on device" simultaneously. Roadmap A4.
5. **Media GC never runs automatically** — only via the Settings button. Startup sweep was deferred at Wave 1 integration and never wired. Roadmap A5.
6. **Web capture pipeline is a stub.** `expo/lib/files.ts` `processPickedPhoto` on web returns the picked URI with hard-coded 1600×1200 dims → wrong aspect ratios in markup/report for web-added photos; no persistence of web images across reloads. Roadmap A6.
7. **Console deprecation warnings on web:** `"shadow*" style props are deprecated` (from `expo/constants/theme.ts` shadow presets) and `props.pointerEvents is deprecated`. Cosmetic but noisy. Roadmap A8.

## 4. What is missing vs Site Audit Pro (competitive gaps)

| Gap | Notes |
|---|---|
| CSV/XLSX export of the hit list | SAP has CSV; locally buildable (Roadmap A-tail) |
| Due dates on issues | Small model+UI addition (Roadmap B/Wave 2 candidate) |
| GPS/photo location evidence | `expo-location` installed, never imported (device-dependent → B) |
| Signature capture (draw-to-sign) | Report has signature *lines* only (B/Wave 2) |
| Assignee/trade management UI | `Assignee` model has company/email/phone/trade fields; no editor UI |
| Voice notes | Dead button in capture (`capture-session.tsx` Voice) (B) |
| Cloud backup / multi-device / share links | Deliberately out of scope for launch (B) |
| Store presence (icons, name, IAP) | B — external |

**Positioning check:** annotation engine (layered, editable, privacy-safe redaction) and report theming are **ahead** of Site Audit Pro. Local-first capture loop is at parity. The launch gap is reliability/finish, not features — consistent with the product brief.

## 5. Web-platform limitations (accepted for Phase 2 testing)

- No real file persistence (`documentDirectory` unavailable) — media lifecycle/GC paths no-op on web; verified by unit tests instead.
- `expo-print` cannot write PDF files on web — A2 defines the web behavior (print dialog).
- Camera/gallery open the browser file dialog — drive it programmatically per EXECUTION_PLAYBOOK.md §4.
- `Alert.alert` no-op — fixed by A1.
- Automation quirks (coordinates are CSS pixels; drawing needs stepped pointer events with `buttons=1`) — documented in EXECUTION_PLAYBOOK.md §4.

## 6. Code-quality assessment

Wave 1 code is production-grade: typed result surfaces, pure testable modules, honest comments recording spikes/tradeoffs (`reportFonts.ts`, `reportImages.ts`), safety-first GC (age gate, reference checks incl. shared files from issue duplication). Remaining debt is listed above and in ROADMAP.md; the largest architectural liability is still AsyncStorage whole-table JSON at scale (mitigated by dirty-table writes; SQLite driver slot documented in ARCHITECTURE.md §2 and `expo/lib/persistence/README.md`).

## 7. Phase 2 QA summary (Sonnet 5, 2026-07-12)

Phase 2 executed ROADMAP.md Category A (A9–A12; A1–A8 were completed and committed just before
this handoff) followed by the EXECUTION_PLAYBOOK.md §1/§6 Final QA Loop, entirely against the
web preview via a hand-rolled Playwright harness (this session's container has no interactive
browser-pane tool — see DECISIONS.md #14). Full narrative and evidence for every item is in
ROADMAP.md's per-item entries and DECISIONS.md #14–#19; this section is the launch-readiness
summary.

**Category A (A9–A12) — all done, one commit each:**
- **A9** — Reports tab's web Share action was a dead-end alert for every export; now routes to PDF Preview pre-loaded with that export's exact original options, where the existing print flow (A2) already works.
- **A10** — Added a real guard dialog when a report would generate with 0 included issues (previously allowed through to a pointless empty PDF); gave the hit list a distinct, correct empty-state message when a status filter matches nothing (it was reusing the generic "capture photos" message, which was actively misleading); noted zero-photo issues instead of leaving a blank gap. Verified — not modified, already correct — long titles/descriptions (wrap cleanly everywhere up to 3000+ chars), project-with-no-audits, and search-no-matches.
- **A11** — Extracted a bounded-concurrency (2) photo processor for multi-select gallery picks with "Processing X/Y…" progress feedback, replacing a serial loop with no feedback. Found along the way that the documented raw-DOM file-injection test technique doesn't work against this library in headless Chromium; the fix (Playwright's `filechooser` API) is now the documented standard technique (EXECUTION_PLAYBOOK §4.5 addendum).
- **A12** — `lib/entitlements.ts` stub (ARCHITECTURE.md §3 exact spec) and `lib/csv.ts` RFC-4180 hit-list export, gated behind `isEntitled("csv_export")` as the architecture's first real entitlement consumer. Verified against real demo data (8 rows, correct quoting of comma-containing dates/descriptions) and the zero-issues disabled state.

**Final QA Loop — 2 passes, 1 real defect found and fixed, Pass 2 clean (zero defects):**
- **The defect:** Markup Studio's `elements` state (and its `elementsRef` mirror, the actual
  source written on Save) snapshotted the saved annotation only once, at component mount. If
  AppStore's async hydration hadn't finished by that first render — the normal case for any
  cold navigation to a markup screen, e.g. a deep link, bookmark, or plain page reload — the
  snapshot was `[]` and never self-corrected. Effect: a previously-saved annotation rendered as
  a blank canvas even though the data was intact in storage, and — the serious part — if the
  user then drew one new element and hit Save, the stale-empty ref would silently **overwrite
  and discard every previously-saved annotation on that photo**, with no error and no warning.
  This is exactly the class of bug a user bug report post-launch would be expensive and
  confusing to diagnose from ("my markup disappeared"). Fixed with a one-shot,
  hydration-gated, dirty-guarded resync effect in `app/markup/[assetId].tsx` (commit `84cfa8c`;
  full root-cause writeup in DECISIONS.md #19). Verified live: reload → correct shapes render →
  selectable → draggable → a follow-up save correctly preserves the edit instead of losing data.
- **Everything else in the 9-step flow checklist** (fresh data, full project/audit/capture flow,
  hit-list filters/group-modes/quick-actions, all three report themes + generate/regenerate +
  staleness, Reports tab, Settings branding + reset, and edge cases including 18 issues in one
  audit via repeated duplication, a 1919-char description typed through the real edit UI, and
  the 0-issue report guard) passed cleanly in both passes with zero defects and zero unexpected
  console errors, run as 19 explicit machine-checked assertions in Pass 2's consolidated
  end-to-end walk.

**Environment/technique notes for whoever runs this next** (full detail in DECISIONS.md
#14–#18): this container has no browser-pane tool, so web verification used a Playwright
script against `npx expo start --web`. The dev server **must not** be started with `CI=1` —
it silently disables Metro's file watcher, which cost significant debugging time before the
root cause was found (`EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npx expo start --web --port 8091`,
no `CI`, is the confirmed-working invocation: no network hang, correct live-reload). The
`expo-image-picker` web file-input injection technique in EXECUTION_PLAYBOOK §4.5 needed a
documented addendum (Playwright's `filechooser` API) to work reliably here.

**Launch-readiness verdict:** all Category A items and the Final QA Loop are complete. No known
defects remain open. Category B items are correctly untouched and their integration seams are
intact (verified by inspection during this pass, not modified). The codebase is in a
launch-candidate state for everything within Category A's scope; Category B (store submission,
branding, monetization, cloud sync, etc.) remains externally blocked as documented in
ROADMAP.md.
