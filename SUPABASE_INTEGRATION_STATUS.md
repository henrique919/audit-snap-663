# PunchThis — Supabase Integration Status Ledger

**Project URL:** https://ytjkfmigzrsoapvnzlof.supabase.co  
**Project ref:** `ytjkfmigzrsoapvnzlof`  
**Git branch:** `feature/supabase-integration`  
**Ledger updated:** 2026-07-19 (Storage live RLS PASS; MCP `user-supabase` re-auth OK)

## Access

- [x] Supabase MCP authenticated to org that owns PunchThis (`henrique919` / `user-supabase`)
- [x] CLI linked to `ytjkfmigzrsoapvnzlof`
- [x] Publishable (anon) key in local `expo/.env.local` (gitignored; template in `expo/.env.example`)

## Definition of Done (checkboxes)

### Auth
- [x] Register (email/password) — UI + AuthProvider (`expo/app/auth/signup.tsx`)
- [x] Email verification — signup uses emailRedirectTo callback (dashboard allowlist still required)
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
- [x] Idempotent retries (no duplicates) — upsert + classified retry
- [x] Fresh-device bootstrap — pull since checkpoint
- [x] Multi-device merge — pull/merge + conflict marking
- [x] Conflicts marked (no silent discard) — `conflicts.ts`

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
- [x] Advisors run; actionable FK index findings fixed; leaked-password = dashboard toggle
- [x] Typecheck / tests / build:web pass (lint: 2 known markup warnings only)
- [x] Documentation complete — `docs/SUPABASE.md`
- [x] Branch committed + pushed — `c79c3a6`

## Migrations

| Name | Local file | Applied remotely |
|------|------------|------------------|
| punchthis_core_schema | `20260719075849_punchthis_core_schema.sql` | yes (`db push`) |
| add_fk_covering_indexes (noop placeholder) | `20260718230518_add_fk_covering_indexes.sql` | yes |
| add_fk_covering_indexes | `20260719090400_add_fk_covering_indexes.sql` | yes |

## Tables / policies / buckets / functions

**Tables (RLS on):** profiles, user_settings, sync_checkpoints, projects, project_locations, assignees, audits, issues, photo_assets, annotation_records, report_exports  

**Buckets:** project-media (50MB, private), report-files (100MB, private)  

**Storage policies:** select/insert/update/delete own prefix for both buckets  

**Edge Functions:** `delete-account` (JWT verify on)

## Commands run

| Command | Result |
|---------|--------|
| `npx supabase link --project-ref ytjkfmigzrsoapvnzlof` | OK |
| `npx supabase db push` (core schema) | OK |
| `npx supabase db push --include-all` (indexes) | OK |
| `npx supabase functions deploy delete-account --use-api` | OK |
| MCP `get_advisors` security | WARN: leaked password protection disabled (dashboard) |
| MCP `get_advisors` performance | INFO: unused indexes (cold DB); FK indexes added |
| MCP RLS SQL two-user test | `rls_ok` |
| `bun run test` | 288 passed |
| `bun run typecheck` | clean |
| `bun run build:web` | OK |
| `bun run lint` | 0 errors / 2 markup warnings |
| `node expo/scripts/verify-storage-rls.mjs` | PASS (upload/download + cross-user + anon + report bucket) |

## Current failures / gaps

1. Auth redirect allowlist + leaked-password protection are dashboard settings (documented in `docs/SUPABASE.md`).
2. Full interactive Auth/email verification requires mailbox + dashboard allowlist.

## Exact next action

1. Operator: set Auth redirect URLs (see `docs/SUPABASE.md`) + enable leaked password protection in Auth settings.

## Final branch / commit / push

- Branch: `feature/supabase-integration`
- Commit: `c79c3a6`
- Pushed: yes
