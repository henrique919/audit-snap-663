-- PunchThis core schema: ownership, sync fields, RLS, private helpers, storage buckets.
-- Compatible with client-generated UUID v4 primary keys.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Private schema for privileged helpers (not exposed via Data API)
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Updated-at + server_version bump
-- ---------------------------------------------------------------------------
create or replace function private.touch_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  if tg_op = 'update' then
    new.server_version := coalesce(old.server_version, 0) + 1;
  end if;
  return new;
end;
$$;

create or replace function private.lock_owner_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'update' then
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;

revoke all on function private.touch_row() from public;
revoke all on function private.lock_owner_id() from public;
grant execute on function private.touch_row() to service_role;
grant execute on function private.lock_owner_id() to service_role;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null default '',
  company_name text not null default '',
  logo_bucket text,
  logo_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  constraint profiles_local_version_positive check (local_version >= 0),
  constraint profiles_server_version_positive check (server_version >= 0)
);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.touch_row();

-- Auto-create profile on signup
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  insert into public.user_settings (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;
  insert into public.sync_checkpoints (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

-- user_settings created before trigger body references it — define table first below
-- (trigger created after user_settings)

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  inspector_name text not null default '',
  company_name text not null default '',
  logo_bucket text,
  logo_path text,
  report_footer_text text not null default '',
  default_report_options jsonb not null default '{}'::jsonb,
  upload_wifi_only boolean not null default true,
  keep_awake_while_uploading boolean not null default false,
  storage_notice_dismissed_at timestamptz,
  last_time_to_first_issue_ms integer,
  last_audit_id uuid,
  last_location_id uuid,
  last_assignee_id uuid,
  last_priority text not null default 'medium'
    check (last_priority in ('low', 'medium', 'high')),
  demo_seeded boolean not null default false,
  local_import_completed_at timestamptz,
  local_import_checkpoint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1
);

create trigger user_settings_touch
  before update on public.user_settings
  for each row execute function private.touch_row();

-- ---------------------------------------------------------------------------
-- sync_checkpoints (pull cursor per user)
-- ---------------------------------------------------------------------------
create table public.sync_checkpoints (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  last_pulled_at timestamptz,
  last_push_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Now attach auth.users trigger (needs user_settings + sync_checkpoints)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  reference text not null default '',
  client_name text not null default '',
  site_address text not null default '',
  company_name text not null default '',
  inspector_name text not null default '',
  cover_bucket text,
  cover_path text,
  logo_bucket text,
  logo_path text,
  status text not null default 'active' check (status in ('active', 'archived')),
  last_report_theme_key text check (
    last_report_theme_key is null
    or last_report_theme_key in ('executive', 'sitewalk', 'handover')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  sync_status text not null default 'synced'
    check (sync_status in ('local_only', 'pending_upload', 'synced', 'conflict', 'error'))
);

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index projects_owner_deleted_idx on public.projects (owner_id, deleted_at);

create trigger projects_touch
  before update on public.projects
  for each row execute function private.touch_row();
create trigger projects_lock_owner
  before update on public.projects
  for each row execute function private.lock_owner_id();

-- ---------------------------------------------------------------------------
-- project_locations
-- ---------------------------------------------------------------------------
create table public.project_locations (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  sync_status text not null default 'synced'
    check (sync_status in ('local_only', 'pending_upload', 'synced', 'conflict', 'error'))
);

create index project_locations_project_idx on public.project_locations (project_id);
create index project_locations_owner_updated_idx on public.project_locations (owner_id, updated_at desc);

create trigger project_locations_touch
  before update on public.project_locations
  for each row execute function private.touch_row();

-- ---------------------------------------------------------------------------
-- assignees (per-owner directory; may be shared across projects)
-- ---------------------------------------------------------------------------
create table public.assignees (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  trade text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  sync_status text not null default 'synced'
    check (sync_status in ('local_only', 'pending_upload', 'synced', 'conflict', 'error'))
);

create index assignees_owner_updated_idx on public.assignees (owner_id, updated_at desc);

create trigger assignees_touch
  before update on public.assignees
  for each row execute function private.touch_row();

-- ---------------------------------------------------------------------------
-- audits
-- ---------------------------------------------------------------------------
create table public.audits (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  audit_date date not null,
  prepared_for text not null default '',
  prepared_by text not null default '',
  status text not null default 'draft' check (status in ('draft', 'completed', 'issued')),
  notes text not null default '',
  default_location_id uuid references public.project_locations (id) on delete set null,
  default_assignee_id uuid references public.assignees (id) on delete set null,
  theme_key text not null default 'executive'
    check (theme_key in ('executive', 'sitewalk', 'handover')),
  completed_at timestamptz,
  report_issued_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  sync_status text not null default 'synced'
    check (sync_status in ('local_only', 'pending_upload', 'synced', 'conflict', 'error'))
);

create index audits_project_idx on public.audits (project_id);
create index audits_owner_updated_idx on public.audits (owner_id, updated_at desc);

create trigger audits_touch
  before update on public.audits
  for each row execute function private.touch_row();

-- ---------------------------------------------------------------------------
-- issues
-- ---------------------------------------------------------------------------
create table public.issues (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  audit_id uuid not null references public.audits (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  location_id uuid references public.project_locations (id) on delete set null,
  issue_number integer not null check (issue_number > 0),
  title text not null default '',
  description text not null default '',
  status text not null default 'open'
    check (status in ('open', 'assigned', 'in_progress', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee_id uuid references public.assignees (id) on delete set null,
  include_in_report boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  sync_status text not null default 'synced'
    check (sync_status in ('local_only', 'pending_upload', 'synced', 'conflict', 'error')),
  unique (audit_id, issue_number)
);

create index issues_audit_idx on public.issues (audit_id);
create index issues_project_idx on public.issues (project_id);
create index issues_owner_updated_idx on public.issues (owner_id, updated_at desc);

create trigger issues_touch
  before update on public.issues
  for each row execute function private.touch_row();

-- ---------------------------------------------------------------------------
-- photo_assets
-- ---------------------------------------------------------------------------
create table public.photo_assets (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  issue_id uuid not null references public.issues (id) on delete cascade,
  audit_id uuid not null references public.audits (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  original_bucket text,
  original_path text,
  report_bucket text,
  report_path text,
  thumb_bucket text,
  thumb_path text,
  annotated_bucket text,
  annotated_path text,
  width integer not null default 0,
  height integer not null default 0,
  captured_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  sync_status text not null default 'synced'
    check (sync_status in ('local_only', 'pending_upload', 'synced', 'conflict', 'error'))
);

create index photo_assets_issue_idx on public.photo_assets (issue_id);
create index photo_assets_owner_updated_idx on public.photo_assets (owner_id, updated_at desc);

create trigger photo_assets_touch
  before update on public.photo_assets
  for each row execute function private.touch_row();

-- ---------------------------------------------------------------------------
-- annotation_records
-- ---------------------------------------------------------------------------
create table public.annotation_records (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  asset_id uuid not null references public.photo_assets (id) on delete cascade,
  issue_id uuid not null references public.issues (id) on delete cascade,
  elements jsonb not null default '[]'::jsonb,
  toolset_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  sync_status text not null default 'synced'
    check (sync_status in ('local_only', 'pending_upload', 'synced', 'conflict', 'error')),
  unique (asset_id)
);

create index annotation_records_owner_updated_idx on public.annotation_records (owner_id, updated_at desc);

create trigger annotation_records_touch
  before update on public.annotation_records
  for each row execute function private.touch_row();

-- ---------------------------------------------------------------------------
-- report_exports
-- ---------------------------------------------------------------------------
create table public.report_exports (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  audit_id uuid not null references public.audits (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  pdf_bucket text,
  pdf_path text,
  issue_count integer not null default 0,
  photo_count integer not null default 0,
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  local_version integer not null default 1,
  server_version integer not null default 1,
  sync_status text not null default 'synced'
    check (sync_status in ('local_only', 'pending_upload', 'synced', 'conflict', 'error'))
);

create index report_exports_audit_idx on public.report_exports (audit_id);
create index report_exports_owner_updated_idx on public.report_exports (owner_id, updated_at desc);

create trigger report_exports_touch
  before update on public.report_exports
  for each row execute function private.touch_row();

-- ---------------------------------------------------------------------------
-- Ownership helpers (validate parent ownership on child writes)
-- ---------------------------------------------------------------------------
create or replace function private.owns_project(p_project_id uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and owner_id = p_owner and deleted_at is null
  );
$$;

create or replace function private.owns_audit(p_audit_id uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.audits
    where id = p_audit_id and owner_id = p_owner
  );
$$;

create or replace function private.owns_issue(p_issue_id uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.issues
    where id = p_issue_id and owner_id = p_owner
  );
$$;

create or replace function private.owns_asset(p_asset_id uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.photo_assets
    where id = p_asset_id and owner_id = p_owner
  );
$$;

revoke all on function private.owns_project(uuid, uuid) from public;
revoke all on function private.owns_audit(uuid, uuid) from public;
revoke all on function private.owns_issue(uuid, uuid) from public;
revoke all on function private.owns_asset(uuid, uuid) from public;
grant execute on function private.owns_project(uuid, uuid) to authenticated;
grant execute on function private.owns_audit(uuid, uuid) to authenticated;
grant execute on function private.owns_issue(uuid, uuid) to authenticated;
grant execute on function private.owns_asset(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.sync_checkpoints enable row level security;
alter table public.projects enable row level security;
alter table public.project_locations enable row level security;
alter table public.assignees enable row level security;
alter table public.audits enable row level security;
alter table public.issues enable row level security;
alter table public.photo_assets enable row level security;
alter table public.annotation_records enable row level security;
alter table public.report_exports enable row level security;

-- profiles
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- user_settings
create policy user_settings_select_own on public.user_settings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy user_settings_insert_own on public.user_settings
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- sync_checkpoints
create policy sync_checkpoints_select_own on public.sync_checkpoints
  for select to authenticated using (owner_id = (select auth.uid()));
create policy sync_checkpoints_insert_own on public.sync_checkpoints
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy sync_checkpoints_update_own on public.sync_checkpoints
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Generic owner-scoped CRUD for top-level tables
create policy projects_select_own on public.projects
  for select to authenticated using (owner_id = (select auth.uid()));
create policy projects_insert_own on public.projects
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy projects_update_own on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy projects_delete_own on public.projects
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy assignees_select_own on public.assignees
  for select to authenticated using (owner_id = (select auth.uid()));
create policy assignees_insert_own on public.assignees
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy assignees_update_own on public.assignees
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy assignees_delete_own on public.assignees
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Child tables: owner_id match + parent ownership
create policy project_locations_select_own on public.project_locations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy project_locations_insert_own on public.project_locations
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.owns_project(project_id, (select auth.uid()))
  );
create policy project_locations_update_own on public.project_locations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and private.owns_project(project_id, (select auth.uid()))
  );
create policy project_locations_delete_own on public.project_locations
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy audits_select_own on public.audits
  for select to authenticated using (owner_id = (select auth.uid()));
create policy audits_insert_own on public.audits
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.owns_project(project_id, (select auth.uid()))
  );
create policy audits_update_own on public.audits
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and private.owns_project(project_id, (select auth.uid()))
  );
create policy audits_delete_own on public.audits
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy issues_select_own on public.issues
  for select to authenticated using (owner_id = (select auth.uid()));
create policy issues_insert_own on public.issues
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.owns_audit(audit_id, (select auth.uid()))
    and private.owns_project(project_id, (select auth.uid()))
  );
create policy issues_update_own on public.issues
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and private.owns_audit(audit_id, (select auth.uid()))
  );
create policy issues_delete_own on public.issues
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy photo_assets_select_own on public.photo_assets
  for select to authenticated using (owner_id = (select auth.uid()));
create policy photo_assets_insert_own on public.photo_assets
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.owns_issue(issue_id, (select auth.uid()))
  );
create policy photo_assets_update_own on public.photo_assets
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and private.owns_issue(issue_id, (select auth.uid()))
  );
create policy photo_assets_delete_own on public.photo_assets
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy annotation_records_select_own on public.annotation_records
  for select to authenticated using (owner_id = (select auth.uid()));
create policy annotation_records_insert_own on public.annotation_records
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.owns_asset(asset_id, (select auth.uid()))
  );
create policy annotation_records_update_own on public.annotation_records
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and private.owns_asset(asset_id, (select auth.uid()))
  );
create policy annotation_records_delete_own on public.annotation_records
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy report_exports_select_own on public.report_exports
  for select to authenticated using (owner_id = (select auth.uid()));
create policy report_exports_insert_own on public.report_exports
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.owns_audit(audit_id, (select auth.uid()))
  );
create policy report_exports_update_own on public.report_exports
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and private.owns_audit(audit_id, (select auth.uid()))
  );
create policy report_exports_delete_own on public.report_exports
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (Data API)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select, insert, update on public.sync_checkpoints to authenticated;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_locations to authenticated;
grant select, insert, update, delete on public.assignees to authenticated;
grant select, insert, update, delete on public.audits to authenticated;
grant select, insert, update, delete on public.issues to authenticated;
grant select, insert, update, delete on public.photo_assets to authenticated;
grant select, insert, update, delete on public.annotation_records to authenticated;
grant select, insert, update, delete on public.report_exports to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'project-media',
    'project-media',
    false,
    52428800, -- 50MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'report-files',
    'report-files',
    false,
    104857600, -- 100MB
    array['application/pdf']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {user_id}/...
-- SELECT
create policy project_media_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy report_files_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- INSERT
create policy project_media_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy report_files_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- UPDATE (upsert)
create policy project_media_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy report_files_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'report-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'report-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- DELETE
create policy project_media_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy report_files_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'report-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
