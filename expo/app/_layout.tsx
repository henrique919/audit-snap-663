import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ActionSheetHost } from "@/components/ActionSheet";
import { StorageErrorBanner } from "@/components/StorageErrorBanner";
import { font, palette } from "@/constants/theme";
import { useAppFonts } from "@/constants/typography";
import { AppStoreProvider } from "@/providers/AppStore";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.carbon,
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
            <RootLayoutNav />
          </GestureHandlerRootView>
        </AppStoreProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
