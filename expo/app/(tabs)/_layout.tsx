import { Tabs } from "expo-router";
import { Camera, FileText, FolderKanban, Settings } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { palette, shadow } from "@/constants/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.navy,
        tabBarInactiveTintColor: palette.textFaint,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          height: Platform.OS === "ios" ? 88 : 68,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Projects",
          tabBarIcon: ({ color, size }) => <FolderKanban color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: "Capture",
          tabBarIcon: () => (
            <View style={styles.captureButton}>
              <Camera color={palette.white} size={24} strokeWidth={2.4} />
            </View>
          ),
          tabBarLabelStyle: { fontSize: 11, fontWeight: "800", color: palette.navy },
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, size }) => <FileText color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  captureButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.navy,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
    borderWidth: 4,
    borderColor: palette.surface,
    ...shadow.floating,
  },
});
