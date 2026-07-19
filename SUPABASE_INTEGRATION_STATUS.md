# PunchThis — Supabase Integration Status Ledger

**Project URL:** https://ytjkfmigzrsoapvnzlof.supabase.co  
**Project ref:** `ytjkfmigzrsoapvnzlof`  
**Git branch:** `feature/supabase-integration`  
**Ledger updated:** 2026-07-19 (takeover hardening complete; live security advisor clear)

## Access

- [x] Supabase MCP authenticated to org that owns PunchThis (`henrique919` / `user-supabase`)
- [x] CLI linked to `ytjkfmigzrsoapvnzlof`
- [x] Publishable (anon) key in local `expo/.env.local` (gitignored; template in `expo/.env.example`)

## Definition of Done (checkboxes)

### Auth
- [x] Register (email/password) — UI + AuthProvider (`expo/app/auth/signup.tsx`)
- [x] Email verification flow — signup uses an allowlisted emailRedirectTo callback
- [x] Login — `expo/app/auth/login.tsx`
- [x] Password recovery request — `forgot-password.tsx`
- [x] Password-reset callback + new-password screen — `callback.tsx` + `reset-password.tsx`
- [x] Session restoration + auto refresh — AuthProvider + client PKCE/AsyncStorage
- [x] Expired-session handling — classified errors via syncRetry
- [x] Logout — Settings cloud section
- [x] Profile display/edit — Settings + AuthProvider.updateProfile
- [x] Secure account deletion — Edge Function `delete-account` deployed; Settings calls it
- [x] Native deep-link callbacks (`punchthis://`) — authRedirect + callback
- [x] Web callback handling — detectSessionInUrl + `/auth/callback`
- [x] Offline reopen with prior session — persistSession true; app usable without cloud
- [x] No redirect loops / unauthenticated flashes / token logging — cloud opt-in; no force gate

### Data + sync
- [x] Existing local data preserved (`caiq:` untouched)
- [x] Idempotent local→cloud import after first login — `localImport.ts` + syncEngine
- [x] Projects / locations / assignees / audits / issues sync — syncEngine push/pull
- [x] Photo variants sync (original, report, thumb, annotated) — upload path in syncEngine
- [x] Annotation JSON sync
- [x] Project covers + logos + user logo sync
- [x] User settings sync
- [x] PDF report exports sync
- [x] Offline queue → reconnect sync — outbox + runSyncCycle
- [x] Interrupted sync resumes — checkpoint + pending outbox
- [x] Idempotent retries (no duplicates) — optimistic version checks + classified retry
- [x] Fresh-device bootstrap — per-device pull cursor; established-account demo cleanup
- [x] Multi-device merge — compare-and-swap push + pull/merge + conflict marking
- [x] Concurrent edits detected with compare-and-swap; newest edit wins deterministically and the record is marked conflicted — `conflicts.ts`

### Security
- [x] RLS on every exposed table — verified remotely
- [x] RLS positive + negative tests (two users) — SQL `rls_ok` with disposable auth.users A/B
- [x] Anonymous DB access fails — included in `rls_ok`
- [x] Cross-user DB access fails — included in `rls_ok`
- [x] Private buckets `project-media` + `report-files` — `public=false`
- [x] Storage policies tested (+/-) with real object upload — `expo/scripts/verify-storage-rls.mjs` PASS
- [x] Anonymous Storage fails — `anon_download_denied`
- [x] Cross-user Storage fails — `b_download_denied` + `report_cross_user_denied`
- [x] Zero client-exposed service-role/secret keys — only EXPO_PUBLIC URL + anon in client

### Platform
- [x] Migrations applied remotely to `ytjkfmigzrsoapvnzlof`
- [x] Migrations reproducible from repo (`supabase/migrations/`)
- [x] Edge Function(s) deployed (`delete-account`)
- [x] Advisors run; security advisor has zero findings; leaked-password protection enabled
- [x] Typecheck / 294 tests / build:web pass; direct ESLint is clean with zero warnings
- [x] Documentation complete — `docs/SUPABASE.md`
- [x] Prior implementation commit pushed — `c79c3a6`; final takeover hardening is delivered in this branch history

## Migrations

| Name | Local file | Applied remotely |
|------|------------|------------------|
| punchthis_core_schema | `20260719075849_punchthis_core_schema.sql` | yes (`db push`) |
| add_fk_covering_indexes (noop placeholder) | `20260718230518_add_fk_covering_indexes.sql` | yes |
| add_fk_covering_indexes | `20260719090400_add_fk_covering_indexes.sql` | yes |
| harden_sync_integrity (UTC ledger alignment) | `20260719044129_harden_sync_integrity.sql` | yes |
| harden_sync_integrity (idempotent clean-install source) | `20260719090401_harden_sync_integrity.sql` | yes |

## Tables / policies / buckets / functions

**Tables (RLS on):** profiles, user_settings, sync_checkpoints, projects, project_locations, assignees, audits, issues, photo_assets, annotation_records, report_exports  

**Buckets:** project-media (50MB, private), report-files (100MB, private)  

**Storage policies:** select/insert/update/delete own prefix for both buckets  

**Edge Functions:** `delete-account` v2 ACTIVE (JWT verify on)

## Commands run

| Command | Result |
|---------|--------|
| `npx supabase link --project-ref ytjkfmigzrsoapvnzlof` | OK |
| `npx supabase db push` (core schema) | OK |
| `npx supabase db push --include-all` (indexes) | OK |
| `npx supabase functions deploy delete-account --use-api` | OK |
| MCP `get_advisors` security | PASS: zero findings |
| MCP `get_advisors` performance | INFO: unused indexes (cold DB); FK indexes added |
| MCP RLS SQL two-user test | `rls_ok` |
| `npm test -- --runInBand --silent` | 294 passed (38 suites) |
| `npm run typecheck` | clean |
| `npm run build:web` | OK |
| direct ESLint `--max-warnings 0` | clean |
| `node expo/scripts/verify-storage-rls.mjs` | PASS (upload/download + cross-user + anon + report bucket) |

## Current failures / gaps

1. Interactive email-delivery verification still requires a mailbox controlled for testing.
2. `punchthis.app/auth/*` currently renders the marketing site. Native deep links are configured; public web Auth needs the Expo web app deployed to an app origin first.

## Exact next action

1. Deploy the Expo web build to `app.punchthis.app` (or another final app origin), then add its callback/reset URLs and run mailbox click-through E2E there.

## Final branch / commit / push

- Branch: `feature/supabase-integration`
- Commit: final takeover hardening changeset (see branch head)
- Pushed: yes
