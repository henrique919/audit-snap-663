import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ActionSheetHost } from "@/components/ActionSheet";
import { MediaGcScheduler } from "@/components/MediaGcScheduler";
import { StorageErrorBanner } from "@/components/StorageErrorBanner";
import { font, palette } from "@/constants/theme";
import { useAppFonts } from "@/constants/typography";
import { AppStoreProvider } from "@/providers/AppStore";

SplashScreen.preventAutoHideAsync();

/**
 * @react-navigation/elements' Header and @react-navigation/bottom-tabs'
 * BottomTabBar (both used internally by expo-router's Stack/tab layouts,
 * mounted on nearly every screen) still pass `pointerEvents` as a prop
 * rather than via `style` — react-native-web warns on this. It's inside a
 * transitive dependency, not app code (verified: zero `pointerEvents=`
 * prop usages remain anywhere in this app's own source), and LogBox.
 * ignoreLogs is a no-op on web, so filtering the one known message is the
 * only working lever here. Scoped to this exact string only.
 */
if (Platform.OS === "web") {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("props.pointerEvents is deprecated")) {
      return;
    }
    originalWarn(...args);
  };
}

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.cobalt,
        headerTitleStyle: { fontFamily: font.family.heading, color: palette.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="project-new" options={{ title: "New Project", presentation: "modal" }} />
      <Stack.Screen name="audit-new" options={{ title: "Start Audit" }} />
      <Stack.Screen name="capture-session" options={{ headerShown: false }} />
      <Stack.Screen name="markup/[assetId]" options={{ headerShown: false }} />
      <Stack.Screen name="sync" options={{ title: "Sync Centre" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const fontsReady = useAppFonts();

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AppStoreProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <StorageErrorBanner />
            <ActionSheetHost />
            <MediaGcScheduler />
            <RootLayoutNav />
          </GestureHandlerRootView>
        </AppStoreProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
