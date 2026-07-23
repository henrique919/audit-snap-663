-- Harden Storage object names and every database reference to private media.
-- The first folder is already owner-scoped by RLS; these immutable helpers
-- additionally enforce the complete PunchThis path contract.

create or replace function private.is_owned_project_media_path(
  p_name text,
  p_owner uuid
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    p_name is not null
    and p_owner is not null
    and (
      -- Account logo.
      p_name ~ (
        '^' || p_owner::text ||
        '/account/logo\.(jpg|jpeg|png|webp|heic|heif)$'
      )
      -- Project cover/logo, with an optional immutable revision folder.
      or p_name ~ (
        '^' || p_owner::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        '/(cover|logo)(/v[1-9][0-9]*)?\.(jpg|jpeg|png|webp|heic|heif)$'
      )
      -- Photo variant: owner/project/issue/asset/vN/variant.ext.
      or p_name ~ (
        '^' || p_owner::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        '(/v[1-9][0-9]*)?/(original|report|thumb|annotated)\.(jpg|jpeg|png|webp|heic|heif)$'
      )
    );
$$;

create or replace function private.is_owned_report_file_path(
  p_name text,
  p_owner uuid
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    p_name is not null
    and p_owner is not null
    and p_name ~ (
      '^' || p_owner::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$'
    );
$$;

revoke all on function private.is_owned_project_media_path(text, uuid) from public;
revoke all on function private.is_owned_report_file_path(text, uuid) from public;
grant execute on function private.is_owned_project_media_path(text, uuid) to authenticated;
grant execute on function private.is_owned_report_file_path(text, uuid) to authenticated;

-- Database rows may only reference their owner's correctly shaped object.
alter table public.profiles
  drop constraint if exists profiles_logo_storage_path_valid,
  add constraint profiles_logo_storage_path_valid
  check (
    logo_path is null
    or (
      logo_bucket = 'project-media'
      and private.is_owned_project_media_path(logo_path, id)
    )
  );

alter table public.user_settings
  drop constraint if exists user_settings_logo_storage_path_valid,
  add constraint user_settings_logo_storage_path_valid
  check (
    logo_path is null
    or (
      logo_bucket = 'project-media'
      and private.is_owned_project_media_path(logo_path, owner_id)
    )
  );

alter table public.projects
  drop constraint if exists projects_cover_storage_path_valid,
  drop constraint if exists projects_logo_storage_path_valid,
  add constraint projects_cover_storage_path_valid
  check (
    cover_path is null
    or (
      cover_bucket = 'project-media'
      and private.is_owned_project_media_path(cover_path, owner_id)
      and split_part(cover_path, '/', 2) = id::text
      and split_part(cover_path, '/', 3) = 'cover'
    )
  ),
  add constraint projects_logo_storage_path_valid
  check (
    logo_path is null
    or (
      logo_bucket = 'project-media'
      and private.is_owned_project_media_path(logo_path, owner_id)
      and split_part(logo_path, '/', 2) = id::text
      and split_part(logo_path, '/', 3) = 'logo'
    )
  );

alter table public.photo_assets
  drop constraint if exists photo_assets_original_storage_path_valid,
  drop constraint if exists photo_assets_report_storage_path_valid,
  drop constraint if exists photo_assets_thumb_storage_path_valid,
  drop constraint if exists photo_assets_annotated_storage_path_valid,
  add constraint photo_assets_original_storage_path_valid
  check (
    original_path is null
    or (
      original_bucket = 'project-media'
      and private.is_owned_project_media_path(original_path, owner_id)
      and split_part(original_path, '/', 2) = project_id::text
      and split_part(original_path, '/', 3) = issue_id::text
      and split_part(original_path, '/', 4) = id::text
      and regexp_replace(original_path, '^.*/', '') like 'original.%'
    )
  ),
  add constraint photo_assets_report_storage_path_valid
  check (
    report_path is null
    or (
      report_bucket = 'project-media'
      and private.is_owned_project_media_path(report_path, owner_id)
      and split_part(report_path, '/', 2) = project_id::text
      and split_part(report_path, '/', 3) = issue_id::text
      and split_part(report_path, '/', 4) = id::text
      and regexp_replace(report_path, '^.*/', '') like 'report.%'
    )
  ),
  add constraint photo_assets_thumb_storage_path_valid
  check (
    thumb_path is null
    or (
      thumb_bucket = 'project-media'
      and private.is_owned_project_media_path(thumb_path, owner_id)
      and split_part(thumb_path, '/', 2) = project_id::text
      and split_part(thumb_path, '/', 3) = issue_id::text
      and split_part(thumb_path, '/', 4) = id::text
      and regexp_replace(thumb_path, '^.*/', '') like 'thumb.%'
    )
  ),
  add constraint photo_assets_annotated_storage_path_valid
  check (
    annotated_path is null
    or (
      annotated_bucket = 'project-media'
      and private.is_owned_project_media_path(annotated_path, owner_id)
      and split_part(annotated_path, '/', 2) = project_id::text
      and split_part(annotated_path, '/', 3) = issue_id::text
      and split_part(annotated_path, '/', 4) = id::text
      and regexp_replace(annotated_path, '^.*/', '') like 'annotated.%'
    )
  );

alter table public.report_exports
  drop constraint if exists report_exports_pdf_storage_path_valid,
  add constraint report_exports_pdf_storage_path_valid
  check (
    pdf_path is null
    or (
      pdf_bucket = 'report-files'
      and private.is_owned_report_file_path(pdf_path, owner_id)
      and split_part(pdf_path, '/', 2) = audit_id::text
      and split_part(pdf_path, '/', 3) = id::text || '.pdf'
    )
  );

-- Storage RLS now requires both API-assigned ownership and a valid PunchThis
-- path. This is defense in depth against malformed or abusive direct uploads.
drop policy if exists project_media_select_own on storage.objects;
drop policy if exists project_media_insert_own on storage.objects;
drop policy if exists project_media_update_own on storage.objects;
drop policy if exists project_media_delete_own on storage.objects;
drop policy if exists report_files_select_own on storage.objects;
drop policy if exists report_files_insert_own on storage.objects;
drop policy if exists report_files_update_own on storage.objects;
drop policy if exists report_files_delete_own on storage.objects;

create policy project_media_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-media'
    and owner_id = (select auth.uid())::text
    and private.is_owned_project_media_path(name, (select auth.uid()))
  );
create policy project_media_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-media'
    and owner_id = (select auth.uid())::text
    and private.is_owned_project_media_path(name, (select auth.uid()))
  );
create policy project_media_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-media'
    and owner_id = (select auth.uid())::text
    and private.is_owned_project_media_path(name, (select auth.uid()))
  )
  with check (
    bucket_id = 'project-media'
    and owner_id = (select auth.uid())::text
    and private.is_owned_project_media_path(name, (select auth.uid()))
  );
create policy project_media_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-media'
    and owner_id = (select auth.uid())::text
    and private.is_owned_project_media_path(name, (select auth.uid()))
  );

create policy report_files_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-files'
    and owner_id = (select auth.uid())::text
    and private.is_owned_report_file_path(name, (select auth.uid()))
  );
create policy report_files_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-files'
    and owner_id = (select auth.uid())::text
    and private.is_owned_report_file_path(name, (select auth.uid()))
  );
create policy report_files_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'report-files'
    and owner_id = (select auth.uid())::text
    and private.is_owned_report_file_path(name, (select auth.uid()))
  )
  with check (
    bucket_id = 'report-files'
    and owner_id = (select auth.uid())::text
    and private.is_owned_report_file_path(name, (select auth.uid()))
  );
create policy report_files_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'report-files'
    and owner_id = (select auth.uid())::text
    and private.is_owned_report_file_path(name, (select auth.uid()))
  );
