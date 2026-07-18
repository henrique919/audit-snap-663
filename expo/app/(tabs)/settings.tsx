/** Settings — inspector defaults, brand info, storage and data management. */

import * as ImagePicker from "expo-image-picker";
import { Database, ImagePlus, RefreshCcw, Trash2, X } from "lucide-react-native";
import React from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark, BrandWordmark } from "@/components/BrandMark";
import { AppButton, Card, Field, SectionTitle } from "@/components/ui";
import { BrandConfig, REPORT_THEMES, ReportThemeKey, resolveThemeKey } from "@/constants/config";
import { font, palette, radius, spacing } from "@/constants/theme";
import { showAlert, showConfirm } from "@/lib/dialogs";
import { persistBrandLogo } from "@/lib/files";
import { estimateMediaStorage, formatBytes, runMediaGc } from "@/lib/mediaRegistry";
import { summarizeWipe } from "@/lib/wipe";
import { useAppStore } from "@/providers/AppStore";

export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, resetAllData, db } = useAppStore();
  const [mediaStats, setMediaStats] = React.useState<{ fileCount: number; totalBytes: number } | null>(null);
  const [cleaning, setCleaning] = React.useState(false);

  const refreshMediaStats = React.useCallback(async () => {
    try {
      const stats = await estimateMediaStorage();
      setMediaStats(stats);
    } catch (e) {
      console.log("[settings] media stats failed", e);
    }
  }, []);

  React.useEffect(() => {
    void refreshMediaStats();
  }, [refreshMediaStats, db.assets.length, db.reports.length, settings.logoUri]);

  const pickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsEditing: false,
      });
      const uri = result.assets?.[0]?.uri;
      if (result.canceled || !uri) return;
      const persisted = await persistBrandLogo(uri);
      updateSettings({ logoUri: persisted });
    } catch (e) {
      console.log("[settings] logo pick failed", e);
      showAlert("Logo upload failed", "Could not save the logo. Please try again.");
    }
  };

  const defaultThemeKey = resolveThemeKey(settings.defaultReportOptions.themeKey);

  const confirmReset = async (reseed: boolean) => {
    const ok = await showConfirm(
      reseed ? "Reset demo data" : "Clear all data",
      reseed
        ? "This replaces everything with fresh demo data. Continue?"
        : "This permanently deletes all projects, audits, issues and photos from this device. Continue?",
      reseed ? "Reset" : "Delete everything",
      true,
    );
    if (!ok) return;

    const result = await resetAllData(reseed);
    await refreshMediaStats();

    if (result.status === "persist_failed") {
      showAlert("Could not clear data", result.error || "Storage clear failed. Please try again.");
      return;
    }

    if (result.status === "wipe_partial") {
      const summary = summarizeWipe(result.wipe);
      showAlert("Some files could not be deleted", summary.message);
      return;
    }

    // Full success only — never claim success on partial file wipe.
    if (reseed) {
      showAlert(
        "Demo data restored",
        "Sample project loaded. Previous records and photo/report files on this device were deleted.",
      );
    } else {
      const summary = summarizeWipe(result.wipe);
      showAlert("All data cleared", summary.message);
    }
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
          <BrandWordmark size={20} />
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

      <SectionTitle title="Report branding" />
      <Card>
        <Text style={styles.fieldLbl}>Company logo</Text>
        <View style={styles.logoRow}>
          <TouchableOpacity style={styles.logoBox} onPress={pickLogo} activeOpacity={0.8} testID="pick-logo">
            {settings.logoUri ? (
              <Image source={{ uri: settings.logoUri }} style={styles.logoImg} resizeMode="contain" />
            ) : (
              <>
                <ImagePlus color={palette.textFaint} size={22} />
                <Text style={styles.logoHint}>Upload logo</Text>
              </>
            )}
          </TouchableOpacity>
          <View style={styles.logoBody}>
            <Text style={styles.logoNote}>
              Appears on report covers and brand areas. Projects with their own logo override this.
            </Text>
            {settings.logoUri ? (
              <TouchableOpacity style={styles.logoRemove} onPress={() => updateSettings({ logoUri: null })}>
                <X color={palette.red} size={13} />
                <Text style={styles.logoRemoveText}>Remove logo</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <Field
          label="Report footer"
          value={settings.reportFooterText}
          onChangeText={(v) => updateSettings({ reportFooterText: v })}
          placeholder={BrandConfig.reportFooter}
          optional
        />
        <Text style={styles.fieldLbl}>Default report theme</Text>
        <View style={styles.themeChips}>
          {(Object.keys(REPORT_THEMES) as ReportThemeKey[]).map((key) => {
            const t = REPORT_THEMES[key];
            const active = defaultThemeKey === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.themeChip, active && { backgroundColor: t.primary, borderColor: t.primary }]}
                onPress={() =>
                  updateSettings({
                    defaultReportOptions: { ...settings.defaultReportOptions, themeKey: key },
                  })
                }
              >
                <View style={[styles.themeDot, { backgroundColor: active ? t.accent : t.primary }]} />
                <Text style={[styles.themeChipText, active && styles.themeChipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <SectionTitle title="Storage" />
      <Card>
        <Text style={styles.note}>
          {mediaStats
            ? `About ${mediaStats.fileCount} media files · ${formatBytes(mediaStats.totalBytes)} on this device`
            : "Measuring media storage…"}
        </Text>
        <AppButton
          testID="cleanup-media"
          label="Clean up unused files"
          variant="secondary"
          loading={cleaning}
          onPress={async () => {
            try {
              setCleaning(true);
              const result = await runMediaGc(db, settings);
              await refreshMediaStats();
              showAlert(
                "Cleanup complete",
                result.deleted === 0
                  ? `No unused files found (${result.scanned} scanned).`
                  : `Removed ${result.deleted} unused file${result.deleted === 1 ? "" : "s"} · freed ${formatBytes(result.freedBytes)}.`,
              );
            } catch (e) {
              console.log("[settings] media gc failed", e);
              showAlert("Cleanup failed", "Could not clean up unused files. Please try again.");
            } finally {
              setCleaning(false);
            }
          }}
          style={styles.cleanupBtn}
        />
        <Text style={styles.note}>
          Removes orphaned photos and reports older than 24 hours that are not referenced by any
          project, issue, or export.
        </Text>
      </Card>

      <SectionTitle title="Data" />
      <TouchableOpacity style={styles.linkRow} activeOpacity={0.8} onPress={() => confirmReset(true)}>
        <View style={styles.linkIcon}>
          <RefreshCcw color={palette.carbon} size={20} />
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
        <Text style={styles.aboutText}>Local-first: everything is stored on this device.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  title: { fontSize: font.size.xxl, fontFamily: font.family.headingHeavy, color: palette.text, letterSpacing: -0.7, marginBottom: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  brandText: { flex: 1 },
  brandSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 1 },
  brandSite: { fontSize: font.size.xs, color: palette.textFaint, marginTop: 1 },
  note: { fontSize: font.size.xs, color: palette.textFaint, lineHeight: 17 },
  fieldLbl: {
    fontSize: font.size.xs,
    fontFamily: font.family.bodyBold,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  logoRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  logoBox: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderStyle: "dashed",
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden",
  },
  logoImg: { width: "100%", height: "100%" },
  logoHint: { fontSize: 10, color: palette.textFaint, fontFamily: font.family.bodySemibold },
  logoBody: { flex: 1, justifyContent: "center", gap: spacing.sm },
  logoNote: { fontSize: font.size.xs, color: palette.textMuted, lineHeight: 16 },
  logoRemove: { flexDirection: "row", alignItems: "center", gap: 4 },
  logoRemoveText: { fontSize: font.size.xs, color: palette.red, fontFamily: font.family.bodySemibold },
  themeChips: { flexDirection: "row", gap: spacing.sm },
  themeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: palette.surface,
  },
  themeDot: { width: 8, height: 8, borderRadius: 4 },
  themeChipText: { fontSize: font.size.xs, fontFamily: font.family.bodyBold, color: palette.text },
  themeChipTextActive: { color: palette.white },
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
  linkTitle: { fontSize: font.size.md, fontFamily: font.family.bodyBold, color: palette.text },
  dangerText: { color: palette.red },
  linkSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
  cleanupBtn: { marginTop: spacing.sm, marginBottom: spacing.sm },
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
