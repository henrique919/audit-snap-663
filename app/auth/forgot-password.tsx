/** Forgot password — request a reset link by email. */

import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BrandMark, BrandWordmark } from "@/components/BrandMark";
import { AppButton, Field } from "@/components/ui";
import { font, palette, spacing } from "@/constants/theme";
import { showAlert } from "@/lib/dialogs";
import { useAuth } from "@/providers/AuthProvider";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { resetPasswordRequest, configured } = useAuth();
  const [email, setEmail] = useState<string>("");
  const [attempted, setAttempted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const emailError = attempted && !isValidEmail(email) ? "Enter a valid email address." : undefined;

  const submit = async () => {
    setAttempted(true);
    if (!isValidEmail(email)) return;
    try {
      setSubmitting(true);
      await resetPasswordRequest(email.trim());
      showAlert("Check your email", "If an account exists for that address, we've sent a link to reset your password.");
      router.replace("/auth/login");
    } catch (e) {
      showAlert("Couldn't send reset link", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Reset password" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <BrandMark size={48} />
          <BrandWordmark size={22} style={styles.wordmark} />
          <Text style={styles.subtitle}>Enter your account email and we will send you a reset link.</Text>
        </View>

        {!configured ? (
          <Text style={styles.warning}>Cloud accounts are not configured for this build yet.</Text>
        ) : null}

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={emailError}
          testID="forgot-email"
        />

        <AppButton label="Send reset link" onPress={submit} loading={submitting} style={styles.submitBtn} testID="forgot-submit" />

        <View style={styles.footerRow}>
          <TouchableOpacity onPress={() => router.replace("/auth/login")}>
            <Text style={styles.link}>Back to sign in</Text>
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
});
