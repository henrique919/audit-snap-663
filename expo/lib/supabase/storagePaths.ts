/**
 * Supabase Storage path conventions.
 *
 * Buckets are private; every object path starts with `{owner_id}/…` so the
 * storage RLS policies (`(storage.foldername(name))[1] = auth.uid()`) hold.
 * Local records reference uploaded objects with a `supabase://bucket/path`
 * URI so the same field (e.g. `PhotoAsset.originalUri`) can hold either a
 * local file URI (not yet uploaded) or a resolved remote reference.
 */

export const STORAGE_BUCKETS = {
  projectMedia: "project-media",
  reportFiles: "report-files",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

export interface StoragePathParts {
  bucket: StorageBucket;
  path: string;
}

export const SUPABASE_REF_SCHEME = "supabase://";

export interface SupabaseRef {
  bucket: string;
  path: string;
}

function extOf(uriOrName: string | null | undefined, fallback: string): string {
  if (!uriOrName) return fallback;
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(uriOrName);
  return match?.[1] ? match[1].toLowerCase() : fallback;
}

/** Build a `supabase://bucket/path` reference for a stored object. */
export function toSupabaseRef(bucket: string, path: string): string {
  return `${SUPABASE_REF_SCHEME}${bucket}/${path}`;
}

export function isSupabaseRef(uri: string | null | undefined): boolean {
  return typeof uri === "string" && uri.startsWith(SUPABASE_REF_SCHEME);
}

/** Parse a `supabase://bucket/path` reference. Returns null for anything else (local URIs, http URLs, empty). */
export function parseSupabaseRef(uri: string | null | undefined): SupabaseRef | null {
  if (!isSupabaseRef(uri)) return null;
  const rest = (uri as string).slice(SUPABASE_REF_SCHEME.length);
  const slash = rest.indexOf("/");
  if (slash <= 0 || slash === rest.length - 1) return null;
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (!bucket || !path) return null;
  return { bucket, path };
}

export type PhotoAssetVariant = "original" | "report" | "thumb" | "annotated";

/** `{owner}/{project}/{issue}/{asset}/{variant}.{ext}` — one folder per issue keeps large audits browsable in Storage. */
export function buildPhotoAssetPath(
  ownerId: string,
  projectId: string,
  issueId: string,
  assetId: string,
  variant: PhotoAssetVariant,
  sourceUriOrExt?: string | null,
  revision?: number,
): StoragePathParts {
  const ext = extOf(sourceUriOrExt, "jpg");
  const revisionPath = revision == null ? "" : `/v${Math.max(1, Math.floor(revision))}`;
  return {
    bucket: STORAGE_BUCKETS.projectMedia,
    path: `${ownerId}/${projectId}/${issueId}/${assetId}${revisionPath}/${variant}.${ext}`,
  };
}

export function buildProjectCoverPath(
  ownerId: string,
  projectId: string,
  sourceUriOrExt?: string | null,
  revision?: number,
): StoragePathParts {
  const revisionPath = revision == null ? "" : `/v${Math.max(1, Math.floor(revision))}`;
  return {
    bucket: STORAGE_BUCKETS.projectMedia,
    path: `${ownerId}/${projectId}/cover${revisionPath}.${extOf(sourceUriOrExt, "jpg")}`,
  };
}

export function buildProjectLogoPath(
  ownerId: string,
  projectId: string,
  sourceUriOrExt?: string | null,
  revision?: number,
): StoragePathParts {
  const revisionPath = revision == null ? "" : `/v${Math.max(1, Math.floor(revision))}`;
  return {
    bucket: STORAGE_BUCKETS.projectMedia,
    path: `${ownerId}/${projectId}/logo${revisionPath}.${extOf(sourceUriOrExt, "png")}`,
  };
}

/** Account-level logo, shared by `profiles` and `user_settings`. */
export function buildAccountLogoPath(ownerId: string, sourceUriOrExt?: string | null): StoragePathParts {
  return {
    bucket: STORAGE_BUCKETS.projectMedia,
    path: `${ownerId}/account/logo.${extOf(sourceUriOrExt, "png")}`,
  };
}

export function buildReportExportPath(ownerId: string, auditId: string, reportId: string): StoragePathParts {
  return {
    bucket: STORAGE_BUCKETS.reportFiles,
    path: `${ownerId}/${auditId}/${reportId}.pdf`,
  };
}

/** True when `uri` is a local file that still needs uploading (not a remote ref, http(s) URL, or empty). */
export function needsUpload(uri: string | null | undefined): boolean {
  if (!uri) return false;
  if (isSupabaseRef(uri)) return false;
  if (/^https?:\/\//i.test(uri)) return false;
  return true;
}
