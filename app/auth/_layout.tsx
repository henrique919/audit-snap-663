/** Auth stack — sign in, sign up, password recovery, and the OAuth/email-link callback. */

import { Stack } from "expo-router";
import React from "react";

import { font, palette } from "@/constants/theme";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.cobaltText,
        headerTitleStyle: { fontFamily: font.family.heading, color: palette.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen name="login" options={{ title: "Sign in" }} />
      <Stack.Screen name="signup" options={{ title: "Create account" }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
      <Stack.Screen name="reset-password" options={{ title: "New password" }} />
      <Stack.Screen name="callback" options={{ title: "Signing in", headerShown: false }} />
    </Stack>
  );
}
