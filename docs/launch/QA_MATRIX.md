# PunchThis — QA matrix

States: `PASS` (evidence linked) · `FAIL` (defect ID) · `UNTESTED` · `N/A` · `WEB-ONLY-PASS` (passed on web; native untested — never counts as native evidence).
Phase 2's final QA (root ROADMAP.md, 2 passes, 19 assertions) provides the baseline web evidence dated 2026-07-12 at `e0c5a86`; re-verify anything a launch task touches.

| Area | Web (Chromium 390×844) | iOS device | Android device | Notes |
|---|---|---|---|---|
| Project create/edit | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| Audit create (defaults, validation) | PASS (P2 final QA) | UNTESTED | UNTESTED | Locale/date fix lands in LP-03 → retest |
| Capture: camera | N/A (no cam in harness) | UNTESTED | UNTESTED | Permission denial+recovery = LP-09 |
| Capture: gallery import | PASS (P2 A11 via filechooser) | UNTESTED | UNTESTED | Limited-library permission = LP-09 |
| Batch import / large photos | UNTESTED | UNTESTED | UNTESTED | |
| Issue record (status/priority/dup) | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| Markup studio (draw/save/reload) | PASS (P2 final QA; reload defect #19 fixed) | UNTESTED | UNTESTED | |
| Hit list (filter/group/quick actions) | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| CSV export (incl. formula-injection guard) | PASS (P2 + D#20 tests) | UNTESTED | UNTESTED | |
| Report builder + preview | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| PDF generation | PASS (web print-window path, P2 A2) | UNTESTED | UNTESTED | Native `printToFileAsync` path unit-tested only |
| Share / Email | PASS (web: mailto + 3 export records) | UNTESTED | UNTESTED | Native share sheet = LP-09 |
| Stale-report detection | PASS (P2 final QA) | UNTESTED | UNTESTED | |
| Persistence failure banner + save-state truth | PASS (P2 A3/A4, unit+instrumented) | UNTESTED | UNTESTED | |
| Offline use | WEB-ONLY-PASS (local-first by design) | UNTESTED | UNTESTED | |
| Backgrounding/kill during save | UNTESTED (env AppState churn, root D#13) | UNTESTED | UNTESTED | |
| Data migration across app upgrade | UNTESTED | UNTESTED | UNTESTED | |
| **Clear All Data (records + files)** | **FAIL → LP-01** (files survive on native) | UNTESTED | UNTESTED | Current top defect |
| Backup / export-all | N/A — feature absent → LP-05 | — | — | |
| Restore | N/A (archival-only by decision L-plan) | — | — | |
| Low storage | UNTESTED | UNTESTED | UNTESTED | |
| VoiceOver | — | UNTESTED | — | Blocked EXT-5 |
| TalkBack | — | — | UNTESTED | Blocked EXT-5 |
| Large text (200%) | UNTESTED | UNTESTED | UNTESTED | LP-06 |
| Keyboard navigation (web) | UNTESTED | — | — | LP-06 |
| Contrast (WCAG AA) | **FAIL → LP-06** (`#96A0A9` 2.66:1, `#4C82FF` 3.53:1, `#E5A016` 2.24:1) | same tokens | same tokens | |
| Small viewport 320w / tablet | UNTESTED / N/A (supportsTablet:false) | — | UNTESTED | |

Update rule: a launch task PASSING requires updating every row it touches, with evidence (screenshot path, test name, or transcript pointer). Native columns move only on physical-device evidence (LP-09).
