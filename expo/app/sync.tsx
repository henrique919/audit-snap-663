/** Sync Centre — local-first status placeholder for future cloud sync. */

import { CheckCircle2, CloudOff, HardDrive, Image as ImageIcon, RefreshCcw } from "lucide-react-native";
import React, { useMemo } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Card, SectionTitle, ToggleRow } from "@/components/ui";
import { font, palette, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/providers/AppStore";

export default function SyncCentreScreen() {
  const { db, settings, updateSettings } = useAppStore();

  const stats = useMemo(() => {
    const records = [...db.projects, ...db.audits, ...db.issues, ...db.locations, ...db.assignees].filter(
      (r) => !r.deletedAt,
    );
    const pendingRecords = records.filter((r) => r.syncStatus !== "synced").length;
    const photos = db.assets.filter((a) => !a.deletedAt).length;
    const reports = db.reports.filter((r) => !r.deletedAt).length;
    return { total: records.length, pendingRecords, photos, reports };
  }, [db]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <CheckCircle2 color={palette.green} size={28} />
        <Text style={styles.heroTitle}>All work is saved on this device</Text>
        <Text style={styles.heroSub}>
          Nothing is lost when you&apos;re offline. Cloud backup and multi-device sync are coming in a
          future update — your data is already structured for it.
        </Text>
      </View>

      <SectionTitle title="Pending for future sync" />
      <Card style={styles.listCard}>
        <View style={styles.row}>
          <HardDrive color={palette.textMuted} size={18} />
          <Text style={styles.rowLabel}>Records pending upload</Text>
          <Text style={styles.rowValue}>{stats.pendingRecords}</Text>
        </View>
        <View style={styles.row}>
          <ImageIcon color={palette.textMuted} size={18} />
          <Text style={styles.rowLabel}>Photos pending upload</Text>
          <Text style={styles.rowValue}>{stats.photos}</Text>
        </View>
        <View style={styles.row}>
          <CloudOff color={palette.textMuted} size={18} />
          <Text style={styles.rowLabel}>Reports pending upload</Text>
          <Text style={styles.rowValue}>{stats.reports}</Text>
        </View>
        <View style={[styles.row, styles.rowLast]}>
          <RefreshCcw color={palette.textMuted} size={18} />
          <Text style={styles.rowLabel}>Last sync</Text>
          <Text style={styles.rowValue}>Never (local mode)</Text>
        </View>
      </Card>

      <SectionTitle title="Upload preferences" />
      <Card>
        <ToggleRow
          label="Upload on Wi-Fi only"
          sub="Avoid mobile data when cloud sync arrives"
          value={settings.uploadWifiOnly}
          onToggle={(v) => updateSettings({ uploadWifiOnly: v })}
        />
        <ToggleRow
          label="Keep screen awake while uploading"
          value={settings.keepAwakeWhileUploading}
          onToggle={(v) => updateSettings({ keepAwakeWhileUploading: v })}
        />
      </Card>

      <AppButton
        label="Retry failed uploads"
        variant="secondary"
        onPress={() =>
          Alert.alert("Local mode", "Cloud sync is not enabled yet. Everything is safely stored on this device.")
        }
        style={styles.retryBtn}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 80 },
  heroCard: {
    backgroundColor: palette.greenSoft,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  heroTitle: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: palette.text, textAlign: "center" },
  heroSub: { fontSize: font.size.sm, color: palette.textMuted, textAlign: "center", lineHeight: 20 },
  listCard: { paddingVertical: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: palette.surfaceAlt,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold, color: palette.text },
  rowValue: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: palette.textMuted },
  retryBtn: { marginTop: spacing.md },
});
