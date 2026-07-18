# PunchThis — Launch Master Plan

**Program branch:** `claude/punchthis-launch` (base: `origin/main` @ `d90a38d`, 2026-07-18)
**Working copy:** `C:\Users\Harry\OneDrive\Documents\Site-Audit-663`
**Source review:** `PUNCHTHIS_FULL_APP_REVIEW.md` (2026-07-18, audited `d90a38d`)
**Prior program docs:** root `STATUS.md` / `ROADMAP.md` / `DECISIONS.md` / `EXECUTION_PLAYBOOK.md` / `ARCHITECTURE.md` record the completed Phase 1/2 hardening (A1–A12 + Final QA). This plan is the successor program; it does not re-plan finished work.

Website-alignment findings from the review are **informational and deferred** (operator instruction). The marketing page is not a design source of truth and no launch task may target it.

---

## Launch gates

| Gate | Surface | Audience | Status |
|---|---|---|---|
| **A** | Controlled web/PWA early access (existing Render deploy) + optional internal TestFlight later | 10–20 invited solo inspectors/supervisors, direct founder support | **ACTIVE — target of this program cycle** |
| **B** | Public web + App Store + Google Play, paid solo plan | Public solo users | Blocked by Gate A + external items (store accounts, name clearance, legal review, devices) |
| **C** | Team expansion (auth, sync, contractor closeout) | Small teams + contractors | Not started; design constraints tracked only |

**Gate A allowed limitations (do not "fix" these for Gate A):** local-first only, no team collaboration, no real-time sync, no cloud-backup claims, no public subscription. Honesty about them is required; removing them is not.

---

## Workstreams and tasks

Task IDs are `LP-nn`. `[P0.x]` maps to the operator brief; review sections cited where useful.
Statuses live in `LAUNCH_STATUS.md` (single source of truth for state).

### Workstream 1 — Data safety (Gate A blocking)

**LP-01 [P0.2] True Clear All Data** — Priority P0 · Risk: critical (dishonest deletion) · Complexity M
`resetAllData` (`providers/AppStore.tsx:614`) calls `clearAllData()` (`lib/store.ts:179`) which only clears the storage driver. Owned media in `PHOTO_DIR`, `REPORT_DIR`, `BRAND_DIR` (`lib/files.ts:16-18`) survives until the 24h-gated GC. UI promises "Delete every project, audit and photo on this device."
*Acceptance:* records + all owned files in the three dirs deleted immediately on native; never touches paths outside the three owned dirs; missing files tolerated; partial failure reported honestly (no false success), retry safe/idempotent; web no-op stays clean; unit tests cover records, photos, reports, brand files, missing files, partial failure, retry; UI wording matches behaviour.
*Depends on:* nothing. **First task.**

**LP-05 [P0.3] Export-all safety archive** — P0 · Risk: high (no recovery path before charging) · Complexity M–L
Smallest dependable Gate A mechanism: export **one archive** (records JSON + owned media) via the native share sheet; described in-app as **archival, not restorable in-app**. Document format + version inside the archive.
*Acceptance:* all records and referenced media included; app states exactly what is included; large projects don't OOM (stream/chunk); interrupted export fails safely with no partial success claim; format documented in `docs/launch/EXPORT_FORMAT.md`; wording says archival.
*Depends on:* LP-01 (shared file-enumeration helpers).

### Workstream 2 — Honest product surface (Gate A blocking)

**LP-02 [P0.6] Remove dead/unfinished controls** — P0 · Risk: high (trust, store rejection later) · Complexity S
Voice button (`app/capture-session.tsx:346-351`) shows a future-feature alert — remove it. Audit the Sync Centre surface (`app/sync.tsx`, Settings link): keep only honest "local-only today" state; no prominent unfinished sync controls; no fake billing; roadmap promises live in docs, not production UI.
*Acceptance:* no visible control whose only behaviour is a "coming soon" message; no unsupported collaboration/backup claims in-app; tests/typecheck/lint pass; capture screen layout verified at mobile viewport after removal.

**LP-03 [P0.7] Repair sample data** — P0 · Risk: high (first-run trust; the flag-photo defect) · Complexity M
`lib/seed.ts` uses random remote stock URLs (`lib/seed.ts:41-51`) so evidence cannot match issue titles (e.g. #008 switchboard → American flag). Replace with **bundled, licence-clear images that match each seeded issue**, label the project as sample content, fix locale (AU address + consistent date format — audit default title currently US-format while the field is ISO), align audit title with default report theme, keep names obviously fictional.
*Acceptance:* every sample photo plausibly matches its issue text; project visibly labelled sample/demo; consistent AU-appropriate dates; no remote fetch needed for seed media; reseed path (`resetAllData(true)`) produces the fixed data; bundle size increase justified (compressed, ≤ ~150KB/photo target).

**LP-04 [P0.4+P0.5] About, support, and data-safety surfaces** — P0 · Risk: high (Gate A requires support path + honest storage warning) · Complexity M
Settings/About must expose: app version + build (from `expo-application`/`expo-constants`), developer/publisher name, support contact (mailto at minimum), product-scope disclaimer, local-storage warning, retention/deletion explanation, camera/photo usage explanation, blur/redaction explanation — using the operator's approved draft wording verbatim (see brief §P0.5; drafts pending legal review, tracked in RELEASE_CHECKLIST). Privacy-policy and terms **screens** in-app now; public URLs are a Gate B item (EXT-2).
*Acceptance:* all items reachable from Settings; wording matches actual behaviour; version/build correct in dev and production builds; screens accessible (labels/roles); no claim of cloud backup/encryption.

### Workstream 3 — Quality infrastructure (Gate A blocking)

**LP-07 [P0.9] CI on GitHub Actions** — P0 · Risk: medium · Complexity S
No `.github/workflows` exists. Add one workflow running the repo's real commands from `expo/`: `bun install`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build:web`. Trigger on PRs and pushes to `main` + `claude/punchthis-launch`. No placeholder steps.
*Acceptance:* workflow green on the launch branch; a deliberately broken test fails the run; commands identical to local ones; documented in RELEASE_CHECKLIST.

**LP-06 [P0.8] Accessibility repair — shared primitives first** — P0 · Risk: high · Complexity L
Per review: shared Button/Chip/ToggleRow/Segmented/Field/tabs/icon-only controls lack roles/labels/states; `Field` claims invalid-state a11y it doesn't implement; contrast failures `#96A0A9` (2.66:1), `#4C82FF` (3.53:1), `#E5A016` (2.24:1) on light backgrounds. Fix primitives + theme tokens, then markup toolbar + camera controls + destructive confirms; announce saves/failures; keyboard activation on web.
*Acceptance:* operator brief §P0.8 list; capture→report journey passes VoiceOver/TalkBack **(native pass deferred to LP-09 if no device — then web keyboard + roles/labels/states + contrast are the Gate A bar)**; normal text meets WCAG AA; status not colour-only; invalid fields programmatically exposed.

### Workstream 4 — Identity & release (Gate B critical path, start when unblocked)

**LP-08 [P0.1] Production app identity** — P0 · Complexity M · **BLOCKED-EXTERNAL**
Replace `app.rork.fsowpwobeaoqe5smtpb03` (iOS bundle + Android package), `rork-app` scheme, slug `fsowpwobeaoqe5smtpb03`, Rork router origin, `start`/`start-web` scripts that call `bunx rork`. Needs: final name clearance (EXT-1), chosen reverse-DNS identifier, Apple/Google developer accounts for full verification. Dev/prod config separation + upgrade implications documented (identity change = new app install on devices).
**LP-09 [P0.10] Native release-candidate matrix** — P0 · Complexity L · **BLOCKED-EXTERNAL** (physical devices + accounts). Matrix lives in `QA_MATRIX.md`; never mark native rows from web evidence.

### Workstream 5 — Activation (P1, post-Gate A)

- **LP-20 [P1.1] Quick Walk** — capture-first onboarding; first issue < 60s; instrument time-to-first-issue, setup abandonment, first audit completion, first report.
- **LP-21 [P1.2] Closeout hub** — Done → completeness warnings, counts, preview/generate, future assignee-pack entry.
- **LP-22 [P1.3] Preset-first reporting** — Site Walk / Client / Handover primary, switches under Advanced, per-project memory.

### Workstream 6 — Closeout loop (P2) and cloud (P3)

P2 order (operator-fixed): due dates → overdue views → completion state → verify/reject → completion photo → contractor closeout link (security requirements in brief §P2) → free contractor response → clone audit → templates → issued-report history → revisions → recipient history.
P3 only after the local model and closeout state machine are stable; never sync raw unversioned JSON blobs. These are design constraints today, not scheduled tasks.

---

## External dependencies (not Claude/Cursor work)

| ID | Item | Blocks | Owner |
|---|---|---|---|
| EXT-1 | Name/trademark clearance ("PunchThis", AU + target markets; IP Australia similar-mark search) | LP-08, store assets | Operator |
| EXT-2 | Public privacy/terms/support/data-deletion URLs (host outside the unfinished marketing site is acceptable) | Gate B submission | Operator |
| EXT-3 | Apple Developer + Google Play accounts | LP-08 verify, LP-09, Gate B | Operator |
| EXT-4 | Legal review of P0.5 wording | Gate B (Gate A ships drafts labelled as such) | Operator |
| EXT-5 | Physical iOS + Android test devices | LP-09, native a11y pass | Operator |
| EXT-6 | Pricing decision (Founding Inspector A$149–199 one-time) | Gate A offer wording, Gate B billing | Operator |

## Non-goals (this cycle)

- Marketing-website work of any kind (operator instruction).
- AI features, BIM, floor plans, QR, voice, analytics, integrations.
- Real billing/IAP (entitlement stub stays; no fake paywall UI).
- Cloud sync/auth (P3).
- SQLite migration (deliberately deferred, root ROADMAP B10).

## Deferred (explicit)

- Restore-from-archive (LP-05 ships archival-only; restore is Gate B+).
- Native TestFlight distribution for Gate A (possible once EXT-3 + LP-08 land; web/PWA does not wait for it).
- Contractor closeout loop (P2) — the #1 product gap, deliberately after Gate A safety.

## Gate A definition of done

All of: LP-01, LP-02, LP-03, LP-04, LP-05, LP-06 (web-scope bar), LP-07 **PASSED** in `LAUNCH_STATUS.md`, plus RELEASE_CHECKLIST.md Gate A section fully ticked, plus a `GO — controlled early access (web/PWA)` decision recorded in `docs/launch/DECISIONS.md` with evidence. Anything less is NO-GO or CONDITIONAL.
