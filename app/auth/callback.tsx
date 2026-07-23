/**
 * Auth callback — completes an email confirmation, password-recovery, or
 * (web) sign-in link, then routes into the app.
 *
 * Native: the PKCE `code` param arrives via the `punchthis://auth/callback`
 * deep link (see authRedirect.ts, app.json's `scheme`, and
 * +native-intent.tsx). `detectSessionInUrl` is web-only (client.ts), so this
 * screen manually exchanges the code for a session.
 * Web: Supabase's own `detectSessionInUrl` has already parsed the URL by
 * the time this screen mounts — it just waits for the resulting session.
 */

import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { AppButton } from "@/components/ui";
import { font, palette, spacing } from "@/constants/theme";
import { consumePasswordRecovery, getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { classifySyncError } from "@/lib/supabase/syncRetry";

function extractParam(url: string | null, key: string): string | null {
  if (!url) return null;
  const match = new RegExp(`[?&]${key}=([^&#]+)`).exec(url);
  return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : null;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let linkingSubscription: { remove: () => void } | null = null;

    async function complete(url: string | null) {
      if (cancelled) return;
      if (!isSupabaseConfigured()) {
        setErrorMessage("Cloud accounts are not configured for this build.");
        return;
      }

      const oauthError = extractParam(url, "error_description") ?? extractParam(url, "error");
      if (oauthError) {
        setErrorMessage(oauthError);
        return;
      }

      try {
        const supabase = await getSupabase();

        if (Platform.OS !== "web") {
          const code = extractParam(url, "code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          }
        }

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!data.session) {
          setErrorMessage("This link has expired or was already used. Please sign in again.");
          return;
        }

        const isRecovery = consumePasswordRecovery() || extractParam(url, "type") === "recovery";
        router.replace(isRecovery ? "/auth/reset-password" : "/");
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(classifySyncError(e).message);
      }
    }

    if (Platform.OS === "web") {
      void complete(typeof window !== "undefined" ? window.location.href : null);
    } else {
      void Linking.getInitialURL().then((url) => complete(url));
      linkingSubscription = Linking.addEventListener("url", ({ url }) => {
        void complete(url);
      });
    }

    return () => {
      cancelled = true;
      linkingSubscription?.remove();
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <BrandMark size={56} />
      {errorMessage ? (
        <>
          <Text style={styles.title}>Could not complete sign-in</Text>
          <Text style={styles.message}>{errorMessage}</Text>
          <AppButton label="Back to sign in" onPress={() => router.replace("/auth/login")} style={styles.button} />
        </>
      ) : (
        <>
          <ActivityIndicator color={palette.cobalt} style={styles.spinner} />
          <Text style={styles.message}>Signing you in…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  spinner: { marginTop: spacing.md },
  title: { fontSize: font.size.lg, fontFamily: font.family.bodyBold, color: palette.text, marginTop: spacing.sm },
  message: { fontSize: font.size.sm, color: palette.textMuted, textAlign: "center" },
  button: { marginTop: spacing.md, minWidth: 200 },
});
