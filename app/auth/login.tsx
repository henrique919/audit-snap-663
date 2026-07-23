/** Sign in — email + password. */

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

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [attempted, setAttempted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const emailError = attempted && !isValidEmail(email) ? "Enter a valid email address." : undefined;
  const passwordError = attempted && password.length === 0 ? "Enter your password." : undefined;

  const submit = async () => {
    setAttempted(true);
    if (!isValidEmail(email) || password.length === 0) return;
    try {
      setSubmitting(true);
      await signIn(email.trim(), password);
      router.replace("/");
    } catch (e) {
      showAlert("Sign in failed", e instanceof Error ? e.message : "Please check your details and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Sign in" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <BrandMark size={48} />
          <BrandWordmark size={22} style={styles.wordmark} />
          <Text style={styles.subtitle}>Sign in to sync your projects across devices.</Text>
        </View>

        {!configured ? (
          <Text style={styles.warning}>
            Cloud accounts are not configured for this build yet — sign-in will not work until Supabase keys are added.
          </Text>
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
          returnKeyType="next"
          error={emailError}
          testID="login-email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={passwordError}
          testID="login-password"
        />

        <TouchableOpacity onPress={() => router.push("/auth/forgot-password")} style={styles.forgotLink}>
          <Text style={styles.link}>Forgot password?</Text>
        </TouchableOpacity>

        <AppButton label="Sign in" onPress={submit} loading={submitting} style={styles.submitBtn} testID="login-submit" />

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Do not have an account?</Text>
          <TouchableOpacity onPress={() => router.replace("/auth/signup")}>
            <Text style={styles.link}> Create one</Text>
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
  forgotLink: { alignSelf: "flex-end", marginTop: -spacing.sm, marginBottom: spacing.lg },
  link: { fontSize: font.size.sm, color: palette.cobaltText, fontFamily: font.family.bodyBold },
  submitBtn: { marginTop: spacing.sm },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  footerText: { fontSize: font.size.sm, color: palette.textMuted },
});
