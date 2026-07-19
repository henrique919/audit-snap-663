/** Create account — email + password + optional display name. */

import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BrandMark, BrandWordmark } from "@/components/BrandMark";
import { AppButton, Field } from "@/components/ui";
import { font, palette, spacing } from "@/constants/theme";
import { showAlert } from "@/lib/dialogs";
import { useAuth } from "@/providers/AuthProvider";

const MIN_PASSWORD_LENGTH = 6;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SignupScreen() {
  const router = useRouter();
  const { signUp, configured } = useAuth();
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [attempted, setAttempted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const emailError = attempted && !isValidEmail(email) ? "Enter a valid email address." : undefined;
  const passwordError =
    attempted && password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined;
  const confirmError = attempted && confirmPassword !== password ? "Passwords don't match." : undefined;

  const submit = async () => {
    setAttempted(true);
    if (!isValidEmail(email) || password.length < MIN_PASSWORD_LENGTH || confirmPassword !== password) return;
    try {
      setSubmitting(true);
      await signUp(email.trim(), password, displayName.trim() || undefined);
      showAlert(
        "Check your email",
        "We've sent a confirmation link to finish creating your account. Come back here once you've verified it.",
      );
      router.replace("/auth/login");
    } catch (e) {
      showAlert("Couldn't create account", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Create account" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <BrandMark size={48} />
          <BrandWordmark size={22} style={styles.wordmark} />
          <Text style={styles.subtitle}>Create a free account to back up and sync your work.</Text>
        </View>

        {!configured ? (
          <Text style={styles.warning}>
            Cloud accounts are not configured for this build yet — account creation will not work until Supabase keys are added.
          </Text>
        ) : null}

        <Field
          label="Name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          optional
          testID="signup-name"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          error={emailError}
          testID="signup-email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="next"
          error={passwordError}
          testID="signup-password"
        />
        <Field
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={confirmError}
          testID="signup-confirm-password"
        />

        <AppButton label="Create account" onPress={submit} loading={submitting} style={styles.submitBtn} testID="signup-submit" />

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.replace("/auth/login")}>
            <Text style={styles.link}> Sign in</Text>
          </TouchableOpacity>
        </View>
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
  link: { fontSize: font.size.sm, color: palette.cobaltText, fontFamily: font.family.bodyBold },
  submitBtn: { marginTop: spacing.sm },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  footerText: { fontSize: font.size.sm, color: palette.textMuted },
});
