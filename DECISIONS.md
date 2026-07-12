# DECISIONS.md — Architectural & Process Decisions Log

Append-only. Each entry: date, decision, one-line rationale. Phase 2 (Sonnet 5) MUST
append here whenever it resolves an ambiguity on its own, per EXECUTION_PLAYBOOK.md.

| # | Date | Decision | Rationale |
|---|------|----------|-----------|
| 1 | 2026-07-12 | Workspace is a full clone at `C:\Users\Harry\Downloads\prymd\audit-snap-663`; all Phase 1/2 work happens here. | Session scratchpad is volatile; this path survives session/model switches. |
| 2 | 2026-07-12 | Phase 1/2 commits are made locally on `main`; no pushes to origin unless the operator explicitly asks. | Pushing is an outward-facing action; local commits satisfy the handoff requirement. |
| 3 | 2026-07-12 | The unmerged remote commit `20d5927` ("Preserve pending writes across retry failures", branch `hardening/data-durability`) is treated as roadmap item A1, to be cherry-picked and verified — not silently merged during Phase 1. | Phase 1 is review-only; the commit changes app logic and must go through the item loop with testing. |
| 4 | 2026-07-12 | Web preview is used as the Phase 2 verification surface, with known web-platform limitations documented in STATUS.md §5 (no file persistence, no real image pipeline, no PDF file output on web). | It is the only runtime available to an autonomous agent on this machine; native-only behaviors are verified by unit tests instead. |
| 5 | 2026-07-12 | Package manager: bun (bun.lock is authoritative; package-lock.json also exists from Wave 1 CI). Use `bun install` + `npx` for tools. | Matches repo lockfile and existing scripts. |
| 6 | 2026-07-12 | Branding is already centralized in `expo/constants/config.ts` (BrandConfig); Phase 1 adds no new branding file. `app.json` cannot import TS, so rename remains a two-file change (config.ts + app.json) documented in ARCHITECTURE.md. | Guardrail: avoid rewriting working code; app.json is a static manifest by design. |
| 7 | 2026-07-12 | A1 (cross-platform dialog shim) is ordered before all other roadmap items, ahead of the PDF fix. | `Alert.alert` is a no-op on web; until it is replaced, Phase 2 cannot see its own failures or drive confirm flows in the verification surface. |
| 8 | 2026-07-12 | Web preview automation specifics (CSS-pixel coords, testID tap helper, stepped pointer events with buttons=1 for drawing, localStorage assertions, deep links, file-input injection) are codified in EXECUTION_PLAYBOOK.md §4 as binding technique. | Phase 1 empirically found naive clicks/drags fail against RN-web; without these techniques Phase 2 would misdiagnose working features as broken. |
| 9 | 2026-07-12 | The dev server config lives OUTSIDE the repo at `C:\Users\Harry\Downloads\prymd\.claude\launch.json` (entry `clean-audit-iq-web`, port 8091). | The Browser-pane preview tool reads launch.json from the session working directory, not the repo. |
