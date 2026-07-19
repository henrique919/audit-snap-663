-- Covering indexes for FK columns flagged by performance advisors.
create index if not exists annotation_records_issue_id_idx on public.annotation_records (issue_id);
create index if not exists audits_default_assignee_id_idx on public.audits (default_assignee_id);
create index if not exists audits_default_location_id_idx on public.audits (default_location_id);
create index if not exists issues_assignee_id_idx on public.issues (assignee_id);
create index if not exists issues_location_id_idx on public.issues (location_id);
create index if not exists photo_assets_audit_id_idx on public.photo_assets (audit_id);
create index if not exists photo_assets_project_id_idx on public.photo_assets (project_id);
create index if not exists report_exports_project_id_idx on public.report_exports (project_id);
