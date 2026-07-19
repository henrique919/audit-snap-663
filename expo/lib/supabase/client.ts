/**
 * Supabase browser/native client — publishable key only.
 * Never import service-role keys here.
 */

import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import type { Database } from "@/lib/supabase/database.types";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey && !publishableKey.includes("YOUR_"));
}

let client: SupabaseClient<Database> | null = null;
let passwordRecoveryPending = false;

async function getAuthStorage() {
  if (Platform.OS === "web") {
    return AsyncStorage;
  }
  // SecureStore has a 2048-byte value limit; session JSON can exceed that.
  // Use AsyncStorage on native too (standard Supabase Expo guidance) and
  // keep SecureStore reserved for small secrets if needed later.
  return AsyncStorage;
}

export async function getSupabase(): Promise<SupabaseClient<Database>> {
  if (client) return client;
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  const storage = await getAuthStorage();
  client = createClient<Database>(url, publishableKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
    },
  });
  client.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") passwordRecoveryPending = true;
    if (event === "SIGNED_OUT" || event === "USER_UPDATED") passwordRecoveryPending = false;
  });
  return client;
}

/** One-shot signal recorded directly from Supabase's PASSWORD_RECOVERY event. */
export function consumePasswordRecovery(): boolean {
  const pending = passwordRecoveryPending;
  passwordRecoveryPending = false;
  return pending;
}

/** Sync accessor after first await getSupabase() — throws if not ready. */
export function getSupabaseSync(): SupabaseClient<Database> {
  if (!client) {
    throw new Error("Supabase client not initialized — call getSupabase() first");
  }
  return client;
}

export function getSupabaseConfig() {
  return { url, publishableKeyConfigured: Boolean(publishableKey) };
}
