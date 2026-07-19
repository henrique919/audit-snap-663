/**
 * Set a new password after following a password-recovery link.
 *
 * By the time this screen mounts, `auth/callback.tsx` has already exchanged
 * the recovery link for a session (native) or Supabase's own
 * `detectSessionInUrl` has done so (web) — this screen only needs a session
 * to already exist and calls `updateUser({ password })` on it.
 */

import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandMark, BrandWordmark } from "@/components/BrandMark";
import { AppButton, Field } from "@/components/ui";
import { font, palette, spacing } from "@/constants/theme";
import { showAlert } from "@/lib/dialogs";
import { useAuth } from "@/providers/AuthProvider";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword, session, loading } = useAuth();
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [attempted, setAttempted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const passwordError =
    attempted && password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined;
  const confirmError = attempted && confirmPassword !== password ? "Passwords don't match." : undefined;

  const submit = async () => {
    setAttempted(true);
    if (password.length < MIN_PASSWORD_LENGTH || confirmPassword !== password) return;
    try {
      setSubmitting(true);
      await updatePassword(password);
      showAlert("Password updated", "Your password has been changed.");
      router.replace("/");
    } catch (e) {
      showAlert("Couldn't update password", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "New password" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <BrandMark size={48} />
          <BrandWordmark size={22} style={styles.wordmark} />
          <Text style={styles.subtitle}>Choose a new password for your account.</Text>
        </View>

        {!loading && !session ? (
          <Text style={styles.warning}>
            This reset link has expired or was already used. Request a new one from the sign-in screen.
          </Text>
        ) : null}

        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="next"
          error={passwordError}
          testID="reset-password"
        />
        <Field
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter your new password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={confirmError}
          testID="reset-confirm-password"
        />

        <AppButton
          label="Update password"
          onPress={submit}
          loading={submitting}
          disabled={!session}
          style={styles.submitBtn}
          testID="reset-submit"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { alignItems: "center", marginBottom: spacing.xl, gap: spacing.sm },
  wordmark: { marginTop: spacing.xs },
  subtitle: { fontSize: font.size.sm, color: palette.textMuted, textAlign: "center", marginTop: spacing.xs },
  warning: {
    fontSize: font.size.xs,
    color: palette.amberText,
    backgroundColor: palette.amberSoft,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
    lineHeight: 17,
  },
  submitBtn: { marginTop: spacing.sm },
});
