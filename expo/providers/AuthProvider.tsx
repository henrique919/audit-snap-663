/**
 * Auth provider — Supabase session state, account profile, and auth actions.
 *
 * Cloud accounts are strictly opt-in: when Supabase isn't configured for
 * this build (`isSupabaseConfigured()` false), this provider never touches
 * the network — `session`/`user`/`profile` stay null and every auth action
 * rejects with a friendly, actionable error. The rest of the app
 * (AppStoreProvider) must keep working fully offline regardless of this
 * provider's state, so nothing here ever blocks on or throws into render.
 */

import createContextHook from "@nkzw/create-context-hook";
import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { getAuthRedirectUrl } from "@/lib/supabase/authRedirect";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { profileFromRow, profileUpdateToRow, type Profile, type ProfileUpdateInput } from "@/lib/supabase/mappers";
import { runSyncCycle } from "@/lib/supabase/syncEngine";
import { classifySyncError } from "@/lib/supabase/syncRetry";

const NOT_CONFIGURED_MESSAGE = "Cloud accounts aren't set up for this build yet.";

function friendlyError(e: unknown): Error {
  return new Error(classifySyncError(e).message);
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);

  const profileRequestRef = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const loadProfile = useCallback(async (userId: string) => {
    const requestId = ++profileRequestRef.current;
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (requestId !== profileRequestRef.current) return;
      if (error) {
        console.log("[auth] profile load failed:", error.message);
        return;
      }
      setProfile(data ? profileFromRow(data) : null);
    } catch (e) {
      if (requestId !== profileRequestRef.current) return;
      console.log("[auth] profile load failed:", e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    if (!userId) return;
    await loadProfile(userId);
  }, [loadProfile]);

  // Initial session + auth-state subscription. Never runs at all when
  // Supabase isn't configured for this build.
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const supabase = await getSupabase();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        if (data.session) void loadProfile(data.session.user.id);

        const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
          setSession(nextSession);
          if (nextSession) {
            void loadProfile(nextSession.user.id);
          } else {
            profileRequestRef.current += 1;
            setProfile(null);
          }
          if (event === "SIGNED_IN") {
            // Fire-and-forget: sync must never block the UI thread or a
            // slow/offline network from completing sign-in.
            void runSyncCycle().catch((e) =>
              console.log("[auth] post-sign-in sync failed:", e instanceof Error ? e.message : String(e)),
            );
          }
        });
        unsubscribe = () => authListener.subscription.unsubscribe();
      } catch (e) {
        console.log("[auth] init failed:", e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [configured, loadProfile]);

  // Native-only auto-refresh lifecycle. `detectSessionInUrl` (client.ts) is
  // web-only, and Supabase's Expo guidance is to gate the refresh timer to
  // foreground so a backgrounded app doesn't keep refreshing tokens nobody
  // is using.
  useEffect(() => {
    if (!configured || Platform.OS === "web") return;
    let cancelled = false;
    let client: Awaited<ReturnType<typeof getSupabase>> | null = null;

    void getSupabase()
      .then((supabase) => {
        if (cancelled) return;
        client = supabase;
        if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
      })
      .catch((e) => console.log("[auth] auto-refresh init failed:", e instanceof Error ? e.message : String(e)));

    const onChange = (state: AppStateStatus) => {
      if (!client) return;
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    const subscription = AppState.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [configured]);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!configured) throw new Error(NOT_CONFIGURED_MESSAGE);
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl("auth/callback"),
          data: displayName ? { display_name: displayName } : undefined,
        },
      });
      if (error) throw friendlyError(error);
    },
    [configured],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!configured) throw new Error(NOT_CONFIGURED_MESSAGE);
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw friendlyError(error);
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (!configured) return;
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) throw friendlyError(error);
  }, [configured]);

  const resetPasswordRequest = useCallback(
    async (email: string) => {
      if (!configured) throw new Error(NOT_CONFIGURED_MESSAGE);
      const supabase = await getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthRedirectUrl("auth/reset-password"),
      });
      if (error) throw friendlyError(error);
    },
    [configured],
  );

  const updatePassword = useCallback(
    async (newPassword: string) => {
      if (!configured) throw new Error(NOT_CONFIGURED_MESSAGE);
      const supabase = await getSupabase();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw friendlyError(error);
    },
    [configured],
  );

  const updateProfile = useCallback(
    async (patch: ProfileUpdateInput) => {
      if (!configured) throw new Error(NOT_CONFIGURED_MESSAGE);
      const userId = sessionRef.current?.user.id;
      if (!userId) throw new Error("Sign in to update your profile.");
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .update(profileUpdateToRow(patch))
        .eq("id", userId)
        .select("*")
        .single();
      if (error) throw friendlyError(error);
      if (data) setProfile(profileFromRow(data));
    },
    [configured],
  );

  const user: User | null = session?.user ?? null;

  return useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      configured,
      signUp,
      signIn,
      signOut,
      resetPasswordRequest,
      updatePassword,
      refreshProfile,
      updateProfile,
    }),
    [session, user, profile, loading, configured, signUp, signIn, signOut, resetPasswordRequest, updatePassword, refreshProfile, updateProfile],
  );
});
