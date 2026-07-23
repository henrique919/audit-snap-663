/**
 * Private Storage references are metadata, not renderable URIs.
 * This module resolves them into a signed web URL or a persistent native
 * cache file while preserving an existing usable local file whenever one
 * is already available.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { CLOUD_CACHE_DIR } from "@/lib/files";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseRef, parseSupabaseRef } from "@/lib/supabase/storagePaths";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const inFlight = new Map<string, Promise<string>>();

function cacheFileName(cloudRef: string): string {
  const parsed = parseSupabaseRef(cloudRef);
  if (!parsed) throw new Error(`Invalid private Storage reference: ${cloudRef}`);
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(parsed.path);
  const ext = extMatch?.[1]?.toLowerCase() ?? "bin";
  const stem = `${parsed.bucket}_${parsed.path}`.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(-180);
  return `${stem}.${ext}`;
}

async function existingNativeUri(uri: string | null | undefined): Promise<string | null> {
  if (!uri || isSupabaseRef(uri) || /^https?:\/\//i.test(uri)) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory ? uri : null;
  } catch {
    return null;
  }
}

async function resolveUncached(cloudRef: string, currentUri?: string | null): Promise<string> {
  const parsed = parseSupabaseRef(cloudRef);
  if (!parsed) throw new Error(`Invalid private Storage reference: ${cloudRef}`);

  if (Platform.OS !== "web") {
    const existing = await existingNativeUri(currentUri);
    if (existing) return existing;

    const dirInfo = await FileSystem.getInfoAsync(CLOUD_CACHE_DIR);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(CLOUD_CACHE_DIR, { intermediates: true });
    const destination = `${CLOUD_CACHE_DIR}${cacheFileName(cloudRef)}`;
    const cached = await FileSystem.getInfoAsync(destination);
    if (cached.exists && !cached.isDirectory) return destination;

    const supabase = await getSupabase();
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not create a media download URL.");
    await FileSystem.downloadAsync(data.signedUrl, destination);
    return destination;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not create a media download URL.");
  return data.signedUrl;
}

/** Resolve a private cloud reference without ever persisting `supabase://` as a render URI. */
export async function materializeCloudRef(
  cloudRef: string | null | undefined,
  currentUri?: string | null,
): Promise<string | null> {
  if (!cloudRef) return currentUri ?? null;
  if (!isSupabaseRef(cloudRef)) return currentUri ?? cloudRef;
  if (Platform.OS !== "web") {
    const existing = await existingNativeUri(currentUri);
    if (existing) return existing;
  }
  const key = `${Platform.OS}:${cloudRef}`;
  const existingPromise = inFlight.get(key);
  if (existingPromise) return existingPromise;
  const promise = resolveUncached(cloudRef, currentUri).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export const mediaCacheInternals = { cacheFileName };
