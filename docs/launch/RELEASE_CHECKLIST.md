# PunchThis — Release checklist

## Gate A — controlled early access (web/PWA, invite-only)

Pilot terms (decision L15): free for 30–60 days, invite-only, founder-supported, structured feedback; measure completed audits, reports generated, repeat usage, time saved, willingness to pay. No paywall in the build.

Product integrity
- [x] LP-01 PASSED — Clear All Data deletes records **and** owned media; honest partial-failure reporting (verified 2026-07-18, `b2f5055`)
- [ ] LP-02 PASSED — no dead controls (Voice removed); no unsupported claims in-app
- [ ] LP-03 PASSED — sample data matches its evidence, labelled sample, AU locale consistent
- [ ] LP-04 PASSED — version/build, support contact, publisher name, product-scope + local-storage + retention/deletion + camera + blur wording live in Settings (drafts labelled pending legal review)
- [ ] LP-05 PASSED — export-all archive works for a large project; interrupted export fails safely; format documented
- [ ] LP-06 PASSED — shared primitives accessible; AA contrast; web keyboard journey completes capture→report
- [ ] LP-07 PASSED — CI green on branch; failure genuinely blocks

Release mechanics
- [ ] `bun run test` / `typecheck` / `lint` / `build:web` all green at the release commit
- [ ] Production web build (`build:web` output) smoke-tested end-to-end (project → audit → photo → issue → markup → report → PDF → clear data)
- [ ] Render deploy updated from the release commit; deployed URL walked through once
- [ ] Local-storage warning visible on first run (not buried)
- [ ] Support path tested (mailto opens with app version prefilled)
- [ ] Early-access invite list (10–20) + who supports them agreed by operator
- [ ] Known-limitations note sent to invitees (local-first, no backup, export regularly)
- [ ] GO decision recorded in docs/launch/DECISIONS.md (decision, surface, evidence, remaining risks w/ severity·likelihood·impact·mitigation·owner·date)

## Gate B — public solo launch (adds to Gate A)

- [ ] LP-10 initial name search clean (or conflicts resolved) + professional trademark advice obtained; LP-08 identity replaced with `com.punchthis.app` or revised choice (no `app.rork.*`, no `rork-app`, no rork start scripts); dev/prod configs split
- [ ] EXT-2 routes live: `/privacy` `/terms` `/support` `/data-deletion` (LP-12 content), public, versioned, no sign-in required
- [ ] Founding Inspector offer finalised from pilot evidence (anchor ≈A$129 one-time / US$79–99 regional; hypotheses in DECISIONS L15)
- [ ] EXT-3 store accounts; release builds (iOS + Android) produced and installed on devices
- [ ] LP-09 device matrix executed — every native UNTESTED row in QA_MATRIX resolved
- [ ] EXT-2 routes linked in-app and in store listings
- [ ] EXT-4 legal review of wording complete; "provisional" labels removed
- [ ] Store privacy declarations (Apple nutrition label, Play Data Safety) match actual behaviour
- [ ] Permission strings (camera, photos) match actual use
- [ ] Monetisation decision implemented honestly (or app ships free; no fake paywall); restore-purchase works if IAP exists
- [ ] Native accessibility pass (VoiceOver + TalkBack capture→report)
- [ ] App icons/splash final (root ROADMAP B6)
- [ ] Upgrade path from Gate A builds tested (identity change = reinstall — communicate to early users)

## Gate C — team expansion

Not opened. Prerequisites tracked in LAUNCH_MASTER_PLAN.md Workstream 6; do not tick anything here before P2 closeout loop + P3 foundations exist.
