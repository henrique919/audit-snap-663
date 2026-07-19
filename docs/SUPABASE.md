# PunchThis — Supabase architecture

**Project URL:** `https://ytjkfmigzrsoapvnzlof.supabase.co`  
**Project ref:** `ytjkfmigzrsoapvnzlof`

This document describes the production Supabase backend for PunchThis. The app remains **local-first**; cloud sync is opt-in after sign-in. The frozen AsyncStorage prefix `caiq:` is never changed.

## Tables (public)

| Table | Purpose |
|-------|---------|
| `profiles` | 1:1 with `auth.users` (display name, company, logo paths) |
| `user_settings` | Synced inspector defaults / report options / import checkpoint |
| `sync_checkpoints` | Per-user pull cursor |
| `projects` | Site projects (`owner_id`) |
| `project_locations` | Locations under a project |
| `assignees` | Owner-scoped assignee directory |
| `audits` | Site walks / audits |
| `issues` | Punch items (unique `issue_number` per audit) |
| `photo_assets` | Evidence media metadata + Storage paths (not signed URLs) |
| `annotation_records` | Markup JSON (`elements` jsonb) |
| `report_exports` | Generated PDF metadata + Storage paths |

All customer tables use UUID PKs compatible with client-generated IDs, `timestamptz`, soft-delete (`deleted_at`), `local_version` / `server_version`, and `sync_status`.

## Storage buckets (private)

| Bucket | Max size | Contents |
|--------|----------|----------|
| `project-media` | 50 MB | original / report / thumb / annotated photos, covers, logos |
| `report-files` | 100 MB | PDF exports |

**Path convention:** `{user_id}/{project_id}/{record_id}/{variant}.{ext}`  
Never persist signed URLs as permanent record values — generate them on demand.

## RLS model

- RLS enabled on every `public` table.
- Policies use `TO authenticated` + `owner_id = auth.uid()` (or `profiles.id = auth.uid()`).
- Child inserts/updates also validate parent ownership via `private.owns_*` helpers.
- `anon` has no customer-data grants.
- Storage object policies require the first path folder to equal `auth.uid()::text`.

## Auth

Client: `@supabase/supabase-js` with PKCE, AsyncStorage session persistence, auto refresh.

Routes:

- `/auth/login`, `/auth/signup`, `/auth/forgot-password`
- `/auth/callback` (web + deep link)
- `/auth/reset-password`

Native redirect scheme: `punchthis://auth/callback` (and reset-password).  
Web: same-origin `/auth/callback`.

### Dashboard Auth URL allowlist (operator)

In [Auth URL configuration](https://supabase.com/dashboard/project/ytjkfmigzrsoapvnzlof/auth/url-configuration) add:

- Site URL: your deployed web origin (and `http://localhost:8081` for local Expo web)
- Redirect allow list:
  - `http://localhost:8081/auth/callback`
  - `http://localhost:8081/auth/reset-password`
  - `https://<your-production-host>/auth/callback`
  - `https://<your-production-host>/auth/reset-password`
  - `punchthis://auth/callback`
  - `punchthis://auth/reset-password`

Optional hardening: enable **Leaked password protection** (HaveIBeenPwned) in Auth settings.

## Sync lifecycle

1. Local mutations write immediately and append compacted outbox entries (existing AppStore path).
2. After sign-in / manual **Sync now** / foreground, `runSyncCycle()`:
   - imports existing local data once (idempotent)
   - pushes outbox in dependency order
   - uploads media variants
   - pulls remote changes since checkpoint
   - merges with conflict marking (no silent discard)
3. Offline use continues; pending items retry with classified backoff.

## Account deletion

Edge Function `delete-account` (JWT required):

1. Verifies caller via user JWT  
2. Deletes Storage objects under `{user_id}/` in both buckets  
3. Deletes owner-scoped rows  
4. Deletes Auth user via service role (secret stays in Supabase function env)

## Environment

Copy `expo/.env.example` → `expo/.env.local` (gitignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://ytjkfmigzrsoapvnzlof.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon or sb_publishable_…>
```

Never put the service-role / secret key in Expo or `EXPO_PUBLIC_*`.

## CLI workflow

```bash
npx supabase link --project-ref ytjkfmigzrsoapvnzlof
npx supabase db push --yes
npx supabase functions deploy delete-account --use-api --yes
npx supabase db advisors --linked   # or MCP get_advisors
```

Migrations under `supabase/migrations/` are the source of truth.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Auth redirects fail | Dashboard redirect allowlist + scheme |
| Sync stays pending | Network, Storage policies, outbox errors in console `[syncEngine]` |
| Profile missing after signup | `private.handle_new_user` trigger on `auth.users` |
| Cross-user data visible | Should be impossible — re-run RLS advisors + policy inventory |
| Function 500 on delete | Function secrets (`SUPABASE_SERVICE_ROLE_KEY`) present in dashboard |

## Verification commands (local)

From `expo/`:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build:web
```
