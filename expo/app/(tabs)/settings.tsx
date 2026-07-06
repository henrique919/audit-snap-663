/** Settings — inspector defaults, brand info, sync centre, data management. */

import { useRouter } from "expo-router";
import { ChevronRight, CloudOff, Database, RefreshCcw, Trash2 } from "lucide-react-native";
import React from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/components/BrandMark";
import { Card, Field, SectionTitle } from "@/components/ui";
import { BrandConfig } from "@/constants/config";
import { font, palette, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/providers/AppStore";

export default function SettingsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, resetAllData, db } = useAppStore();

  const pendingCount = [
    ...db.projects,
    ...db.audits,
    ...db.issues,
    ...db.assets,
  ].filter((r) => r.syncStatus !== "synced" && !r.deletedAt).length;

  const confirmReset = (reseed: boolean) => {
    Alert.alert(
      reseed ? "Reset demo data" : "Clear all data",
      reseed
        ? "This replaces everything with fresh demo data. Continue?"
        : "This permanently deletes all projects, audits, issues and photos from this device. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: reseed ? "Reset" : "Delete everything",
          style: "destructive",
          onPress: () => {
            resetAllData(reseed);
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      <View style={styles.brandRow}>
        <BrandMark size={52} />
        <View style={styles.brandText}>
          <Text style={styles.brandName}>{BrandConfig.appName}</Text>
          <Text style={styles.brandSub}>{BrandConfig.tagline}</Text>
          <Text style={styles.brandSite}>{BrandConfig.website}</Text>
        </View>
      </View>

      <SectionTitle title="Inspector defaults" />
      <Card>
        <Field
          label="Inspector name"
          value={settings.inspectorName}
          onChangeText={(v) => updateSettings({ inspectorName: v })}
          placeholder="Your name on reports"
        />
        <Field
          label="Company name"
          value={settings.companyName}
          onChangeText={(v) => updateSettings({ companyName: v })}
          placeholder="Shown on report covers"
          optional
        />
        <Text style={styles.note}>
          Used as defaults when starting new audits. Each project can override these.
        </Text>
      </Card>

      <SectionTitle title="Sync" />
      <TouchableOpacity
        style={styles.linkRow}
        activeOpacity={0.8}
        onPress={() => router.push("/sync")}
        testID="open-sync-centre"
      >
        <View style={styles.linkIcon}>
          <CloudOff color={palette.navy} size={20} />
        </View>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Sync Centre</Text>
          <Text style={styles.linkSub}>
            All work saved on device · {pendingCount} records pending future sync
          </Text>
        </View>
        <ChevronRight color={palette.textFaint} size={18} />
      </TouchableOpacity>

      <SectionTitle title="Data" />
      <TouchableOpacity style={styles.linkRow} activeOpacity={0.8} onPress={() => confirmReset(true)}>
        <View style={styles.linkIcon}>
          <RefreshCcw color={palette.navy} size={20} />
        </View>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Reset demo data</Text>
          <Text style={styles.linkSub}>Replace everything with the sample project</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkRow} activeOpacity={0.8} onPress={() => confirmReset(false)}>
        <View style={[styles.linkIcon, styles.linkIconDanger]}>
          <Trash2 color={palette.red} size={20} />
        </View>
        <View style={styles.linkBody}>
          <Text style={[styles.linkTitle, styles.dangerText]}>Clear all data</Text>
          <Text style={styles.linkSub}>Delete every project, audit and photo on this device</Text>
        </View>
      </TouchableOpacity>

      <SectionTitle title="About" />
      <View style={styles.aboutCard}>
        <Database color={palette.textFaint} size={16} />
        <Text style={styles.aboutText}>
          Local-first: everything is stored on this device. Cloud backup, multi-device sync and web
          access arrive in a future update.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: palette.text, letterSpacing: -0.4, marginBottom: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  brandText: { flex: 1 },
  brandName: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: palette.text },
  brandSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 1 },
  brandSite: { fontSize: font.size.xs, color: palette.textFaint, marginTop: 1 },
  note: { fontSize: font.size.xs, color: palette.textFaint, lineHeight: 17 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  linkIconDanger: { backgroundColor: palette.redSoft },
  linkBody: { flex: 1 },
  linkTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: palette.text },
  dangerText: { color: palette.red },
  linkSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
  aboutCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  aboutText: { flex: 1, fontSize: font.size.xs, color: palette.textMuted, lineHeight: 18 },
});
