/**
 * Account deletion.
 *
 * Deleting a cloud account (auth user + every owned row/object) has to run
 * server-side with elevated privileges, so this calls a `delete-account`
 * Edge Function with the caller's own JWT rather than deleting anything
 * directly from the client. That function doesn't exist yet in this repo
 * (see `supabase/functions`) — until it's deployed this honestly reports
 * "not available yet" instead of pretending the account was removed.
 */

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { classifySyncError } from "@/lib/supabase/syncRetry";

export interface DeleteAccountResult {
  ok: boolean;
  error?: string;
}

const NOT_AVAILABLE_MESSAGE = "Account deletion isn't available in this build yet. Contact support to remove your account.";

export async function deleteAccount(): Promise<DeleteAccountResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Cloud accounts aren't configured for this build." };
  }

  try {
    const supabase = await getSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { ok: false, error: "Sign in again before deleting your account." };
    }

    const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
    if (error) {
      // A 404 from the functions gateway means the function simply isn't
      // deployed yet — surface that honestly rather than a generic error.
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 404) {
        return { ok: false, error: NOT_AVAILABLE_MESSAGE };
      }
      return { ok: false, error: classifySyncError(error).message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: classifySyncError(e).message || NOT_AVAILABLE_MESSAGE };
  }
}
