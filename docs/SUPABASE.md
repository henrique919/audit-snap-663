# PunchThis — Supabase architecture

**Project URL:** `https://ytjkfmigzrsoapvnzlof.supabase.co`  
**Project ref:** `ytjkfmigzrsoapvnzlof`

This document describes the production Supabase backend for PunchThis. The app remains **local-first**; cloud sync is opt-in after sign-in. The frozen AsyncStorage prefix `caiq:` is never changed.

## Tables (public)

| Table | Purpose |
|-------|---------|
| `profiles` | 1:1 with `auth.users` (display name, company, logo paths) |
| `user_settings` | Synced inspector defaults / report options |
| `sync_checkpoints` | Account-level sync activity telemetry (not a device cursor) |
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

**Path convention:** `{user_id}/{project_id}/{record_id}/v{local_version}/{variant}.{ext}` for mutable media.
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

Configured in [Auth URL configuration](https://supabase.com/dashboard/project/ytjkfmigzrsoapvnzlof/auth/url-configuration):

- Site URL: `https://punchthis.app`
- Redirect allow list:
  - `http://localhost:8081/auth/callback`
  - `http://localhost:8081/auth/reset-password`
  - `https://punchthis.app/auth/callback`
  - `https://punchthis.app/auth/reset-password`
  - `punchthis://auth/callback`
  - `punchthis://auth/reset-password`

**Leaked password protection** is enabled and the server minimum is 8 characters. The app uses the same minimum.

`punchthis.app` currently serves the marketing site, not this Expo application. Native callbacks are production-ready through the `punchthis://` scheme. Before offering web login publicly, deploy the Expo web build to a dedicated app origin (recommended: `app.punchthis.app`) and add that origin's two callback URLs here and in the dashboard.

## Sync lifecycle

1. Local mutations write immediately and append compacted outbox entries (existing AppStore path).
2. After sign-in / manual **Sync now** / foreground, `runSyncCycle()`:
   - imports existing local data once (idempotent)
   - pushes outbox in dependency order
   - uploads media variants
   - pulls remote changes since the device-local checkpoint
   - detects concurrent edits with compare-and-swap, then resolves deterministically by newest edit timestamp and marks the record as conflicted
3. Sign-in, foregrounding, reconnect, and a 60-second foreground heartbeat trigger a single-flight sync; failures retry with classified exponential backoff.

Pull cursors and first-import progress are device-local. They are deliberately not copied through `user_settings`, because a shared cursor can make a newly installed device skip historical rows. Private Storage references are kept separately from renderable local/signed URIs; native downloads use the owned `cloud-cache/` directory and web signed URLs are refreshed.

## Account deletion

Edge Function `delete-account` (JWT required):

1. Verifies caller via user JWT  
2. Deletes Storage objects under `{user_id}/` in both buckets  
3. Deletes the Auth user via the service role; `ON DELETE CASCADE` removes every owner-scoped database row
4. Clears the local session and device-owned PunchThis files/data

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
npm ci
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build:web
```
