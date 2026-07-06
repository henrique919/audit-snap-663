/** Report Builder — simple but powerful. Defaults produce an excellent report. */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Eye } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Card, Chip, Segmented, SectionTitle, ToggleRow } from "@/components/ui";
import { REPORT_THEMES, ReportThemeKey } from "@/constants/config";
import { font, palette, spacing } from "@/constants/theme";
import { useAppStore, useAudit, useIssuesForAudit } from "@/providers/AppStore";
import type { ReportOptions } from "@/types/models";

export default function ReportBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { settings, updateSettings } = useAppStore();
  const audit = useAudit(id);
  const issues = useIssuesForAudit(id);

  const [options, setOptions] = useState<ReportOptions>({
    ...settings.defaultReportOptions,
    themeKey: audit?.themeKey ?? settings.defaultReportOptions.themeKey,
  });

  if (!audit) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Audit not found.</Text>
      </View>
    );
  }

  const set = (patch: Partial<ReportOptions>) => setOptions((prev) => ({ ...prev, ...patch }));

  const includedCount = issues.filter(
    (i) => i.includeInReport && (options.includeCompleted || i.status !== "completed"),
  ).length;

  const preview = () => {
    updateSettings({ defaultReportOptions: options });
    router.push({
      pathname: "/audit/[id]/preview",
      params: { id: audit.id, options: JSON.stringify(options) },
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: "Report Builder" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.summary}>
          <Text style={styles.summaryStrong}>{includedCount}</Text> of {issues.length} issues will be
          included in “{audit.title}”.
        </Text>

        <SectionTitle title="Theme" />
        <View style={styles.chipRow}>
          {(Object.keys(REPORT_THEMES) as ReportThemeKey[]).map((key) => (
            <Chip
              key={key}
              label={REPORT_THEMES[key].label}
              active={options.themeKey === key}
              onPress={() => set({ themeKey: key })}
            />
          ))}
        </View>

        <SectionTitle title="Sections" />
        <Card>
          <ToggleRow label="Cover page" value={options.coverPage} onToggle={(v) => set({ coverPage: v })} />
          <ToggleRow label="Summary & hit list table" value={options.includeSummary} onToggle={(v) => set({ includeSummary: v })} />
          <ToggleRow label="Item detail pages" value={options.includeDetails} onToggle={(v) => set({ includeDetails: v })} />
          <ToggleRow label="Signature block" value={options.includeSignature} onToggle={(v) => set({ includeSignature: v })} />
        </Card>

        <SectionTitle title="Photos" />
        <Card>
          <ToggleRow
            label="Marked-up photos"
            sub="Vector markup rendered crisp in the PDF"
            value={options.includeAnnotatedPhotos}
            onToggle={(v) => set({ includeAnnotatedPhotos: v })}
          />
          <ToggleRow
            label="Original photos"
            sub="Adds the clean original beside marked-up shots"
            value={options.includeOriginalPhotos}
            onToggle={(v) => set({ includeOriginalPhotos: v })}
          />
          <Text style={styles.fieldLbl}>Image size</Text>
          <Segmented
            options={[
              { value: "compact", label: "Compact" },
              { value: "standard", label: "Standard" },
              { value: "large", label: "Large" },
            ]}
            value={options.imageSize}
            onChange={(v) => set({ imageSize: v })}
          />
        </Card>

        <SectionTitle title="Content" />
        <Card>
          <ToggleRow label="Timestamps" value={options.includeTimestamps} onToggle={(v) => set({ includeTimestamps: v })} />
          <ToggleRow label="Page numbers" value={options.includePageNumbers} onToggle={(v) => set({ includePageNumbers: v })} />
          <ToggleRow label="Photo locations" value={options.includePhotoLocations} onToggle={(v) => set({ includePhotoLocations: v })} />
          <ToggleRow
            label="Completed issues"
            sub="Off = live/open issues only"
            value={options.includeCompleted}
            onToggle={(v) => set({ includeCompleted: v })}
          />
        </Card>

        <SectionTitle title="Order" />
        <Card>
          <Text style={styles.fieldLbl}>Group items</Text>
          <Segmented
            options={[
              { value: "location", label: "By location" },
              { value: "assignee", label: "By assignee" },
              { value: "none", label: "No grouping" },
            ]}
            value={options.groupBy}
            onChange={(v) => set({ groupBy: v })}
          />
          <Text style={[styles.fieldLbl, styles.fieldSpacing]}>Sort items</Text>
          <Segmented
            options={[
              { value: "number", label: "Issue number" },
              { value: "capture", label: "Capture order" },
            ]}
            value={options.sortBy}
            onChange={(v) => set({ sortBy: v })}
          />
        </Card>

        <AppButton
          testID="preview-report"
          label="Preview Report"
          icon={<Eye color={palette.white} size={18} />}
          onPress={preview}
          style={styles.previewBtn}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 80 },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  summary: { fontSize: font.size.md, color: palette.textMuted },
  summaryStrong: { fontFamily: font.family.bodyHeavy, color: palette.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fieldLbl: {
    fontSize: font.size.xs,
    fontFamily: font.family.bodyBold,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: 8,
  },
  fieldSpacing: { marginTop: spacing.lg },
  previewBtn: { marginTop: spacing.xl },
});
