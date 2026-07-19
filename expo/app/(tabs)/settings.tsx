/** Settings — inspector defaults, brand info, storage and data management. */

import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { CloudOff, Database, ImagePlus, Mail, RefreshCcw, Shield, Trash2, UserX, X } from "lucide-react-native";
import React from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark, BrandWordmark } from "@/components/BrandMark";
import { AppButton, Card, Field, SectionTitle } from "@/components/ui";
import { BrandConfig, REPORT_THEMES, ReportThemeKey, resolveThemeKey } from "@/constants/config";
import { font, palette, radius, spacing } from "@/constants/theme";
import { deleteAccount } from "@/lib/supabase/account";
import { showAlert, showConfirm } from "@/lib/dialogs";
import {
  buildExportSuccessMessage,
  EXPORT_ROW_SUBCOPY,
  EXPORT_ROW_TITLE,
  EXPORT_SUCCESS_TITLE,
  exportAllData,
} from "@/lib/exportArchive";
import { persistBrandLogo } from "@/lib/files";
import { BUILD_ID, buildSupportMailto, PUBLISHER_NAME } from "@/lib/legalCopy";
import { estimateMediaStorage, formatBytes, runMediaGc } from "@/lib/mediaRegistry";
import { runSyncCycle } from "@/lib/supabase/syncEngine";
import { summarizeWipe } from "@/lib/wipe";
import { useAppStore } from "@/providers/AppStore";
import { useAuth } from "@/providers/AuthProvider";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

function summarizeSyncResult(result: Awaited<ReturnType<typeof runSyncCycle>>): string {
  if (!result.configured) return "Cloud sync isn't configured for this build yet.";
  if (!result.authenticated) return "Sign in to sync your projects and photos to the cloud.";
  if (result.ok) {
    const parts: string[] = [];
    if (result.pushed > 0) parts.push(`${result.pushed} change${result.pushed === 1 ? "" : "s"} uploaded`);
    if (result.pulled > 0) parts.push(`${result.pulled} update${result.pulled === 1 ? "" : "s"} downloaded`);
    if (result.mediaUploaded > 0) parts.push(`${result.mediaUploaded} photo${result.mediaUploaded === 1 ? "" : "s"} uploaded`);
    return parts.length > 0 ? `Everything's up to date — ${parts.join(", ")}.` : "Everything's already up to date.";
  }
  return result.errors[0] ?? "Sync couldn't finish. Please try again.";
}

function CloudAccountSection() {
  const router = useRouter();
  const { configured, session, user, profile, signOut, updateProfile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = React.useState<string>(profile?.displayName ?? "");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    setDisplayName(profile?.displayName ?? "");
  }, [profile?.displayName]);

  React.useEffect(() => {
    if (session) void refreshProfile();
    // Only re-run when the signed-in user changes, not on every profile update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  if (!configured) {
    return (
      <>
        <SectionTitle title="Cloud account" />
        <Card>
          <View style={styles.cloudUnavailableRow}>
            <CloudOff color={palette.textFaint} size={18} />
            <Text style={styles.note}>
              Cloud backup is not set up for this build yet. Everything still works fully offline on this device.
            </Text>
          </View>
        </Card>
      </>
    );
  }

  if (!session || !user) {
    return (
      <>
        <SectionTitle title="Cloud account" />
        <Card>
          <Text style={styles.note}>
            Sign in to back up your projects, audits and photos to the cloud and sync them across devices. This is
            entirely optional — the app keeps working offline either way.
          </Text>
          <View style={styles.cloudButtonRow}>
            <AppButton
              testID="cloud-sign-in"
              label="Sign in"
              variant="secondary"
              onPress={() => router.push("/auth/login")}
              style={styles.cloudButtonHalf}
            />
            <AppButton
              testID="cloud-create-account"
              label="Create account"
              onPress={() => router.push("/auth/signup")}
              style={styles.cloudButtonHalf}
            />
          </View>
        </Card>
      </>
    );
  }

  const profileDirty = displayName.trim() !== (profile?.displayName ?? "");

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);
      await updateProfile({ displayName: displayName.trim() });
    } catch (e) {
      showAlert("Couldn't save profile", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      const result = await runSyncCycle();
      showAlert(result.ok ? "Sync complete" : "Sync finished with issues", summarizeSyncResult(result));
    } catch (e) {
      console.log("[settings] sync now failed", e);
      showAlert("Sync failed", "Could not sync with the cloud. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    const ok = await showConfirm("Sign out", "You'll still be able to use this app offline.", "Sign out");
    if (!ok) return;
    try {
      setSigningOut(true);
      await signOut();
    } catch (e) {
      showAlert("Couldn't sign out", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await showConfirm(
      "Delete account",
      "This permanently deletes your cloud account and every project, audit and photo synced to it. This can't be undone. Data on this device is not affected.",
      "Delete account",
      true,
    );
    if (!ok) return;
    try {
      setDeleting(true);
      const result = await deleteAccount();
      if (!result.ok) {
        showAlert("Couldn't delete account", result.error ?? "Please try again.");
        return;
      }
      await signOut();
      showAlert("Account deleted", "Your cloud account has been removed.");
    } catch (e) {
      showAlert("Couldn't delete account", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <SectionTitle title="Cloud account" />
      <Card>
        <Text style={styles.fieldLbl}>Signed in as</Text>
        <Text style={styles.cloudEmail} testID="cloud-account-email">
          {profile?.email ?? user.email ?? "—"}
        </Text>
        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          testID="cloud-display-name"
        />
        <AppButton
          testID="cloud-save-profile"
          label="Save profile"
          variant="secondary"
          disabled={!profileDirty}
          loading={savingProfile}
          onPress={handleSaveProfile}
          style={styles.cleanupBtn}
        />
      </Card>

      <Card style={styles.cloudActionsCard}>
        <AppButton
          testID="cloud-sync-now"
          label="Sync now"
          icon={<RefreshCcw color={palette.white} size={17} />}
          loading={syncing}
          onPress={handleSyncNow}
        />
        <AppButton
          testID="cloud-sign-out"
          label="Sign out"
          variant="secondary"
          loading={signingOut}
          onPress={handleSignOut}
          style={styles.cloudSecondaryBtn}
        />
        <AppButton
          testID="cloud-delete-account"
          label="Delete account"
          variant="danger"
          icon={<UserX color={palette.white} size={17} />}
          loading={deleting}
          onPress={handleDeleteAccount}
          style={styles.cloudSecondaryBtn}
        />
      </Card>
    </>
  );
}

export default function SettingsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, resetAllData, db } = useAppStore();
  const [mediaStats, setMediaStats] = React.useState<{ fileCount: number; totalBytes: number } | null>(null);
  const [cleaning, setCleaning] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [exportPhase, setExportPhase] = React.useState<string | null>(null);

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

  const handleExportAll = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      setExportPhase(null);
      const outcome = await exportAllData(db, settings, (phase) => setExportPhase(phase));
      if (outcome.ok) {
        showAlert(EXPORT_SUCCESS_TITLE, buildExportSuccessMessage(outcome));
      }
      // Failure dialogs are shown by exportAllData itself (see lib/exportArchive.ts).
    } catch (e) {
      console.log("[settings] export failed", e);
    } finally {
      setExporting(false);
      setExportPhase(null);
    }
  };

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

      <CloudAccountSection />

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

      <Card>
        <Text style={styles.fieldLbl}>{EXPORT_ROW_TITLE}</Text>
        <Text style={styles.note}>{EXPORT_ROW_SUBCOPY}</Text>
        <AppButton
          testID="export-all-data"
          label="Export all data"
          variant="secondary"
          icon={<Database color={palette.carbon} size={17} />}
          loading={exporting}
          onPress={handleExportAll}
          style={styles.cleanupBtn}
        />
        {exporting && exportPhase ? (
          <Text style={styles.phaseText} testID="export-phase">
            {exportPhase}
          </Text>
        ) : null}
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
      <Text style={styles.aboutMeta}>
        Version {APP_VERSION} · Build {BUILD_ID}
      </Text>
      <Text style={styles.aboutMeta}>{PUBLISHER_NAME}</Text>

      <TouchableOpacity
        testID="link-data-privacy"
        style={styles.linkRow}
        activeOpacity={0.8}
        onPress={() => router.push("/data-privacy")}
      >
        <View style={styles.linkIcon}>
          <Shield color={palette.carbon} size={20} />
        </View>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Data & privacy</Text>
          <Text style={styles.linkSub}>How your projects, photos and reports are stored</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        testID="link-contact-support"
        style={styles.linkRow}
        activeOpacity={0.8}
        onPress={() => Linking.openURL(buildSupportMailto(APP_VERSION))}
      >
        <View style={styles.linkIcon}>
          <Mail color={palette.carbon} size={20} />
        </View>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Contact support</Text>
          <Text style={styles.linkSub}>Email us with a question or issue</Text>
        </View>
      </TouchableOpacity>
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
  cloudUnavailableRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  cloudButtonRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  cloudButtonHalf: { flex: 1 },
  cloudEmail: { fontSize: font.size.md, fontFamily: font.family.bodySemibold, color: palette.text, marginBottom: spacing.lg },
  cloudActionsCard: { marginTop: spacing.md, gap: spacing.sm },
  cloudSecondaryBtn: { marginTop: 0 },
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
  phaseText: {
    fontSize: font.size.xs,
    color: palette.textMuted,
    fontFamily: font.family.bodySemibold,
    textAlign: "center",
    marginTop: -4,
  },
  aboutCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  aboutText: { flex: 1, fontSize: font.size.xs, color: palette.textMuted, lineHeight: 18 },
  aboutMeta: { fontSize: font.size.xs, color: palette.textFaint, marginTop: spacing.sm, marginLeft: 2 },
});
