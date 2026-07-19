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
import { classifySyncError, nextBackoffMs } from "@/lib/supabase/syncRetry";
import { loadSettings } from "@/lib/store";

const NOT_CONFIGURED_MESSAGE = "Cloud accounts aren't set up for this build yet.";

function friendlyError(e: unknown): Error {
  return new Error(classifySyncError(e).message);
}

async function assertAccountBinding(userId: string): Promise<void> {
  const settings = await loadSettings();
  if (settings.cloudAccountId && settings.cloudAccountId !== userId) {
    throw new Error(
      "This device's saved data belongs to another cloud account. Clear local data before signing in with a different account.",
    );
  }
}

async function assertCanCreateAccount(): Promise<void> {
  const settings = await loadSettings();
  if (settings.cloudAccountId) {
    throw new Error(
      "This device's saved data is already linked to a cloud account. Clear local data before creating a different account.",
    );
  }
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
        if (data.session) {
          try {
            await assertAccountBinding(data.session.user.id);
          } catch (e) {
            await supabase.auth.signOut({ scope: "local" });
            console.log("[auth] blocked cross-account session:", e instanceof Error ? e.message : String(e));
            setSession(null);
            return;
          }
        }
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

  // Opportunistic cloud sync: sign-in, foreground, browser reconnect, and a
  // bounded retry/heartbeat while the app remains active. runSyncCycle is
  // single-flight, so these triggers cannot race each other or manual sync.
  useEffect(() => {
    if (!configured || !session?.user.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failureAttempt = 0;

    const schedule = (delayMs: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), delayMs);
    };

    const syncNow = async () => {
      if (cancelled || AppState.currentState !== "active") return;
      const result = await runSyncCycle();
      if (cancelled) return;
      if (result.ok) {
        failureAttempt = 0;
        schedule(60_000);
      } else {
        schedule(nextBackoffMs(failureAttempt++));
      }
    };

    void syncNow();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow();
      else if (timer) clearTimeout(timer);
    });
    const webOnline = () => void syncNow();
    if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("online", webOnline);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      appStateSubscription.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("online", webOnline);
    };
  }, [configured, session?.user.id]);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!configured) throw new Error(NOT_CONFIGURED_MESSAGE);
      await assertCanCreateAccount();
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw friendlyError(error);
      if (data.user) {
        try {
          await assertAccountBinding(data.user.id);
        } catch (e) {
          await supabase.auth.signOut({ scope: "local" });
          throw e;
        }
      }
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (!configured) return;
    const supabase = await getSupabase();
    // Signing out this device must not revoke sessions on the user's other
    // phones/tablets or interrupt uploads already running there.
    const { error } = await supabase.auth.signOut({ scope: "local" });
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
