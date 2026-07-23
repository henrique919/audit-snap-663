-- Harden PunchThis ownership, sync metadata, and cross-table relationships.

-- SECURITY DEFINER ownership helpers must never act as an oracle for an
-- arbitrary owner UUID. RLS always passes auth.uid(); enforce that here too.
create or replace function private.owns_project(p_project_id uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = (select auth.uid()) and exists (
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
  select p_owner = (select auth.uid()) and exists (
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
  select p_owner = (select auth.uid()) and exists (
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
  select p_owner = (select auth.uid()) and exists (
    select 1 from public.photo_assets
    where id = p_asset_id and owner_id = p_owner
  );
$$;

-- Clients may supply timestamps/local versions for offline records, but the
-- server is authoritative for sync status and the initial server version.
create or replace function private.initialize_sync_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.server_version := 1;
  new.sync_status := 'synced';
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function private.initialize_sync_row() from public;

drop trigger if exists projects_initialize_sync on public.projects;
create trigger projects_initialize_sync
  before insert on public.projects
  for each row execute function private.initialize_sync_row();
drop trigger if exists project_locations_initialize_sync on public.project_locations;
create trigger project_locations_initialize_sync
  before insert on public.project_locations
  for each row execute function private.initialize_sync_row();
drop trigger if exists assignees_initialize_sync on public.assignees;
create trigger assignees_initialize_sync
  before insert on public.assignees
  for each row execute function private.initialize_sync_row();
drop trigger if exists audits_initialize_sync on public.audits;
create trigger audits_initialize_sync
  before insert on public.audits
  for each row execute function private.initialize_sync_row();
drop trigger if exists issues_initialize_sync on public.issues;
create trigger issues_initialize_sync
  before insert on public.issues
  for each row execute function private.initialize_sync_row();
drop trigger if exists photo_assets_initialize_sync on public.photo_assets;
create trigger photo_assets_initialize_sync
  before insert on public.photo_assets
  for each row execute function private.initialize_sync_row();
drop trigger if exists annotation_records_initialize_sync on public.annotation_records;
create trigger annotation_records_initialize_sync
  before insert on public.annotation_records
  for each row execute function private.initialize_sync_row();
drop trigger if exists report_exports_initialize_sync on public.report_exports;
create trigger report_exports_initialize_sync
  before insert on public.report_exports
  for each row execute function private.initialize_sync_row();

-- Foreign keys alone allow internally inconsistent graphs (for example an
-- issue that references an audit from project A and project B directly).
-- Validate the complete owner/project/audit/issue chain on every write.
create or replace function private.validate_punchthis_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'project_locations' then
    if not exists (
      select 1 from public.projects p
      where p.id = new.project_id and p.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Location project/owner relationship is invalid';
    end if;

  elsif tg_table_name = 'audits' then
    if not exists (
      select 1 from public.projects p
      where p.id = new.project_id and p.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Audit project/owner relationship is invalid';
    end if;
    if new.default_location_id is not null and not exists (
      select 1 from public.project_locations l
      where l.id = new.default_location_id
        and l.project_id = new.project_id
        and l.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Audit default location is outside its project';
    end if;
    if new.default_assignee_id is not null and not exists (
      select 1 from public.assignees a
      where a.id = new.default_assignee_id and a.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Audit default assignee is outside its account';
    end if;

  elsif tg_table_name = 'issues' then
    if not exists (
      select 1 from public.audits a
      where a.id = new.audit_id
        and a.project_id = new.project_id
        and a.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Issue audit/project/owner relationship is invalid';
    end if;
    if new.location_id is not null and not exists (
      select 1 from public.project_locations l
      where l.id = new.location_id
        and l.project_id = new.project_id
        and l.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Issue location is outside its project';
    end if;
    if new.assignee_id is not null and not exists (
      select 1 from public.assignees a
      where a.id = new.assignee_id and a.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Issue assignee is outside its account';
    end if;

  elsif tg_table_name = 'photo_assets' then
    if not exists (
      select 1
      from public.issues i
      join public.audits a on a.id = i.audit_id
      where i.id = new.issue_id
        and i.audit_id = new.audit_id
        and i.project_id = new.project_id
        and i.owner_id = new.owner_id
        and a.project_id = new.project_id
        and a.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Photo issue/audit/project/owner relationship is invalid';
    end if;

  elsif tg_table_name = 'annotation_records' then
    if not exists (
      select 1 from public.photo_assets p
      where p.id = new.asset_id
        and p.issue_id = new.issue_id
        and p.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Annotation photo/issue/owner relationship is invalid';
    end if;

  elsif tg_table_name = 'report_exports' then
    if not exists (
      select 1 from public.audits a
      where a.id = new.audit_id
        and a.project_id = new.project_id
        and a.owner_id = new.owner_id
    ) then
      raise exception using errcode = '23514', message = 'Report audit/project/owner relationship is invalid';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_punchthis_relationship() from public;

drop trigger if exists project_locations_validate_relationship on public.project_locations;
create trigger project_locations_validate_relationship
  before insert or update on public.project_locations
  for each row execute function private.validate_punchthis_relationship();
drop trigger if exists audits_validate_relationship on public.audits;
create trigger audits_validate_relationship
  before insert or update on public.audits
  for each row execute function private.validate_punchthis_relationship();
drop trigger if exists issues_validate_relationship on public.issues;
create trigger issues_validate_relationship
  before insert or update on public.issues
  for each row execute function private.validate_punchthis_relationship();
drop trigger if exists photo_assets_validate_relationship on public.photo_assets;
create trigger photo_assets_validate_relationship
  before insert or update on public.photo_assets
  for each row execute function private.validate_punchthis_relationship();
drop trigger if exists annotation_records_validate_relationship on public.annotation_records;
create trigger annotation_records_validate_relationship
  before insert or update on public.annotation_records
  for each row execute function private.validate_punchthis_relationship();
drop trigger if exists report_exports_validate_relationship on public.report_exports;
create trigger report_exports_validate_relationship
  before insert or update on public.report_exports
  for each row execute function private.validate_punchthis_relationship();

-- Bucket and path are a single reference and must be set or cleared together.
alter table public.profiles
  drop constraint if exists profiles_logo_reference_complete,
  add constraint profiles_logo_reference_complete
  check ((logo_bucket is null) = (logo_path is null));
alter table public.user_settings
  drop constraint if exists user_settings_logo_reference_complete,
  add constraint user_settings_logo_reference_complete
  check ((logo_bucket is null) = (logo_path is null));
alter table public.projects
  drop constraint if exists projects_cover_reference_complete,
  drop constraint if exists projects_logo_reference_complete,
  add constraint projects_cover_reference_complete
  check ((cover_bucket is null) = (cover_path is null)),
  add constraint projects_logo_reference_complete
  check ((logo_bucket is null) = (logo_path is null));
alter table public.photo_assets
  drop constraint if exists photo_assets_original_reference_complete,
  drop constraint if exists photo_assets_report_reference_complete,
  drop constraint if exists photo_assets_thumb_reference_complete,
  drop constraint if exists photo_assets_annotated_reference_complete,
  add constraint photo_assets_original_reference_complete
  check ((original_bucket is null) = (original_path is null)),
  add constraint photo_assets_report_reference_complete
  check ((report_bucket is null) = (report_path is null)),
  add constraint photo_assets_thumb_reference_complete
  check ((thumb_bucket is null) = (thumb_path is null)),
  add constraint photo_assets_annotated_reference_complete
  check ((annotated_bucket is null) = (annotated_path is null));
alter table public.report_exports
  drop constraint if exists report_exports_pdf_reference_complete,
  add constraint report_exports_pdf_reference_complete
  check ((pdf_bucket is null) = (pdf_path is null));
