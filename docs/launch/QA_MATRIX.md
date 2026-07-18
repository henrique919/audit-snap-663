# PunchThis — QA matrix

States: `PASS` (evidence linked) · `FAIL` (defect ID) · `UNTESTED` · `N/A` · `WEB-ONLY-PASS` (passed on web; native untested — never counts as native evidence).
Phase 2's final QA (root ROADMAP.md, 2 passes, 19 assertions) provides the baseline web evidence dated 2026-07-12 at `e0c5a86`; re-verify anything a launch task touches.

| Area | Web (Chromium 390×844) | iOS device | Android device | Notes |
|---|---|---|---|---|
| Project create/edit | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| Audit create (defaults, validation) | PASS (P2 final QA) | UNTESTED | UNTESTED | Locale/date fix lands in LP-03 → retest |
| Quick Walk (LP-20) | **WEB-ONLY-PASS** (2026-07-19 Cursor: Capture → Quick Walk → name → capture-session; skips audit-new; optional setup prompt; `quickWalk.test.ts`) | UNTESTED | UNTESTED | Full Start New Audit path preserved |
| Capture: camera | N/A (no cam in harness) | UNTESTED | UNTESTED | Permission denial+recovery = LP-09 |
| Capture: gallery import | PASS (P2 A11 via filechooser) | UNTESTED | UNTESTED | Limited-library permission = LP-09 |
| Batch import / large photos | UNTESTED | UNTESTED | UNTESTED | |
| Issue record (status/priority/dup) | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| Markup studio (draw/save/reload) | PASS (P2 final QA; reload defect #19 fixed) | UNTESTED | UNTESTED | |
| Hit list (filter/group/quick actions) | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| Closeout hub (LP-21) | **WEB-ONLY-PASS** (2026-07-19 Cursor: status counts + completeness warnings + Preview/Generate on hit list; `closeoutHub.test.ts`) | UNTESTED | UNTESTED | Assignee packs omitted (no dead control) |
| CSV export (incl. formula-injection guard) | PASS (P2 + D#20 tests) | UNTESTED | UNTESTED | |
| Report builder + preview | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| PDF generation | PASS (web print-window path, P2 A2) | UNTESTED | UNTESTED | Native `printToFileAsync` path unit-tested only |
| Share / Email | PASS (web: mailto + 3 export records) | UNTESTED | UNTESTED | Native share sheet = LP-09 |
| Stale-report detection | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| Persistence failure banner + save-state truth | PASS (P2 A3/A4, unit+instrumented) | UNTESTED | UNTESTED | |
| Offline use | WEB-ONLY-PASS (local-first by design) | UNTESTED | UNTESTED | |
| Backgrounding/kill during save | UNTESTED (env AppState churn, root D#13) | UNTESTED | UNTESTED | |
| Data migration across app upgrade | UNTESTED | UNTESTED | UNTESTED | |
| **Clear All Data (records + files)** | **PASS** (2026-07-18 Claude live verify @ `b2f5055`: clear + reseed flows, honest dialogs, storage zeroed, no console errors) | UNTESTED (file wipe = mocked unit tests) | UNTESTED (same) | Fixed by LP-01; native rows move on LP-09 |
| Backup / export-all | N/A — feature absent → LP-05 | — | — | |
| Restore | N/A (archival-only by decision L-plan) | — | — | |
| Low storage | UNTESTED | UNTESTED | UNTESTED | |
| VoiceOver | — | UNTESTED | — | Blocked EXT-5 |
| TalkBack | — | — | UNTESTED | Blocked EXT-5 |
| Large text (200%) | UNTESTED | UNTESTED | UNTESTED | LP-06 |
| Keyboard navigation (web) | UNTESTED | — | — | LP-06 |
| Contrast (WCAG AA) | **PASS (web)** — LP-06 `9fd4386`: `contrast.test.ts` computes ≥4.5:1 for fixed text tokens (`textFaint`, `cobaltText`, `amberText`; `textFaintOnDark` split) | same tokens | same tokens | native SR pass = LP-09 |
| Keyboard navigation (web) | **PARTIAL** — a11y tree now populated with roles/labels (LP-06); full Tab/Enter journey to re-drive at Gate A sign-off | — | — | |
| Backup / export-all | **PASS (web)** — LP-05 `56eba77`: live export = 267KB zip, 30 entries (records+media+manifest), archival wording | UNTESTED (native share sheet) | UNTESTED | |
| Sample data integrity | **PASS (web)** — LP-03 `8120aa3`: bundled sample photos match issues (#008 no longer a flag), 0 remote URLs, Sample-labelled | UNTESTED | UNTESTED | |
| Production identity / app boot | **PASS (web)** — LP-08 `68a86b6`: `com.punchthis.app`, Rork SDK removed, boots on new metro config | UNTESTED (native build) | UNTESTED | LP-09 |
| Small viewport 320w / tablet | UNTESTED / N/A (supportsTablet:false) | — | UNTESTED | |

Update rule: a launch task PASSING requires updating every row it touches, with evidence (screenshot path, test name, or transcript pointer). Native columns move only on physical-device evidence (LP-09).
