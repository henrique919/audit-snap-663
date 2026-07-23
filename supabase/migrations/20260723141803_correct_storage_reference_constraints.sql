-- Correct the reference constraints introduced by 20260723135635.
-- Unrevisioned project paths end in cover.ext/logo.ext, while revisioned
-- paths use cover/vN.ext and logo/vN.ext. Also require bucket/path pairs to
-- be either both null or both valid.

alter table public.profiles
  drop constraint if exists profiles_logo_storage_path_valid,
  add constraint profiles_logo_storage_path_valid
  check (
    (logo_path is null and logo_bucket is null)
    or (
      logo_path is not null
      and logo_bucket = 'project-media'
      and private.is_owned_project_media_path(logo_path, id)
      and split_part(logo_path, '/', 2) = 'account'
      and split_part(logo_path, '/', 3) like 'logo.%'
    )
  );

alter table public.user_settings
  drop constraint if exists user_settings_logo_storage_path_valid,
  add constraint user_settings_logo_storage_path_valid
  check (
    (logo_path is null and logo_bucket is null)
    or (
      logo_path is not null
      and logo_bucket = 'project-media'
      and private.is_owned_project_media_path(logo_path, owner_id)
      and split_part(logo_path, '/', 2) = 'account'
      and split_part(logo_path, '/', 3) like 'logo.%'
    )
  );

alter table public.projects
  drop constraint if exists projects_cover_storage_path_valid,
  drop constraint if exists projects_logo_storage_path_valid,
  add constraint projects_cover_storage_path_valid
  check (
    (cover_path is null and cover_bucket is null)
    or (
      cover_path is not null
      and cover_bucket = 'project-media'
      and private.is_owned_project_media_path(cover_path, owner_id)
      and split_part(cover_path, '/', 2) = id::text
      and (
        split_part(cover_path, '/', 3) = 'cover'
        or split_part(cover_path, '/', 3) like 'cover.%'
      )
    )
  ),
  add constraint projects_logo_storage_path_valid
  check (
    (logo_path is null and logo_bucket is null)
    or (
      logo_path is not null
      and logo_bucket = 'project-media'
      and private.is_owned_project_media_path(logo_path, owner_id)
      and split_part(logo_path, '/', 2) = id::text
      and (
        split_part(logo_path, '/', 3) = 'logo'
        or split_part(logo_path, '/', 3) like 'logo.%'
      )
    )
  );

alter table public.photo_assets
  drop constraint if exists photo_assets_original_storage_path_valid,
  drop constraint if exists photo_assets_report_storage_path_valid,
  drop constraint if exists photo_assets_thumb_storage_path_valid,
  drop constraint if exists photo_assets_annotated_storage_path_valid,
  add constraint photo_assets_original_storage_path_valid
  check (
    (original_path is null and original_bucket is null)
    or (
      original_path is not null
      and original_bucket = 'project-media'
      and private.is_owned_project_media_path(original_path, owner_id)
      and split_part(original_path, '/', 2) = project_id::text
      and split_part(original_path, '/', 3) = issue_id::text
      and split_part(original_path, '/', 4) = id::text
      and regexp_replace(original_path, '^.*/', '') like 'original.%'
    )
  ),
  add constraint photo_assets_report_storage_path_valid
  check (
    (report_path is null and report_bucket is null)
    or (
      report_path is not null
      and report_bucket = 'project-media'
      and private.is_owned_project_media_path(report_path, owner_id)
      and split_part(report_path, '/', 2) = project_id::text
      and split_part(report_path, '/', 3) = issue_id::text
      and split_part(report_path, '/', 4) = id::text
      and regexp_replace(report_path, '^.*/', '') like 'report.%'
    )
  ),
  add constraint photo_assets_thumb_storage_path_valid
  check (
    (thumb_path is null and thumb_bucket is null)
    or (
      thumb_path is not null
      and thumb_bucket = 'project-media'
      and private.is_owned_project_media_path(thumb_path, owner_id)
      and split_part(thumb_path, '/', 2) = project_id::text
      and split_part(thumb_path, '/', 3) = issue_id::text
      and split_part(thumb_path, '/', 4) = id::text
      and regexp_replace(thumb_path, '^.*/', '') like 'thumb.%'
    )
  ),
  add constraint photo_assets_annotated_storage_path_valid
  check (
    (annotated_path is null and annotated_bucket is null)
    or (
      annotated_path is not null
      and annotated_bucket = 'project-media'
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
    (pdf_path is null and pdf_bucket is null)
    or (
      pdf_path is not null
      and pdf_bucket = 'report-files'
      and private.is_owned_report_file_path(pdf_path, owner_id)
      and split_part(pdf_path, '/', 2) = audit_id::text
      and split_part(pdf_path, '/', 3) = id::text || '.pdf'
    )
  );
