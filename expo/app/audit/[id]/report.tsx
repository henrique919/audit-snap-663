/** Report Builder — preset-first (LP-22); switches under Advanced. */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronRight, Eye } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppButton, Card, Segmented, SectionTitle, ToggleRow } from "@/components/ui";
import { REPORT_THEMES, ReportThemeKey, resolveThemeKey } from "@/constants/config";
import { font, palette, radius, spacing } from "@/constants/theme";
import {
  getPresetSummary,
  projectThemeMemoryPatch,
  resolveInitialReportTheme,
} from "@/lib/reportPresets";
import { useAppStore, useAudit, useIssuesForAudit, useProject } from "@/providers/AppStore";
import type { ReportOptions } from "@/types/models";

export default function ReportBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { settings, updateSettings, updateProject, updateAudit } = useAppStore();
  const audit = useAudit(id);
  const project = useProject(audit?.projectId);
  const issues = useIssuesForAudit(id);

  const initialTheme = useMemo(
    () =>
      resolveInitialReportTheme({
        projectTheme: project?.lastReportThemeKey,
        auditTheme: audit?.themeKey,
        settingsTheme: settings.defaultReportOptions.themeKey,
      }),
    [project?.lastReportThemeKey, audit?.themeKey, settings.defaultReportOptions.themeKey],
  );

  const [options, setOptions] = useState<ReportOptions>(() => ({
    ...settings.defaultReportOptions,
    themeKey: initialTheme,
  }));
  const [advancedOpen, setAdvancedOpen] = useState(false);

  if (!audit) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Audit not found.</Text>
      </View>
    );
  }

  const set = (patch: Partial<ReportOptions>) => setOptions((prev) => ({ ...prev, ...patch }));

  const selectPreset = (key: ReportThemeKey) => {
    set({ themeKey: key });
    updateAudit(audit.id, { themeKey: key });
    if (project) {
      updateProject(project.id, projectThemeMemoryPatch(key));
    }
  };

  const includedCount = issues.filter(
    (i) => i.includeInReport && (options.includeCompleted || i.status !== "completed"),
  ).length;

  const activeSummary = getPresetSummary(options.themeKey);

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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.summary}>
          <Text style={styles.summaryStrong}>{includedCount}</Text> of {issues.length} issues will be
          included in “{audit.title}”.
        </Text>

        <SectionTitle title="Report preset" />
        <View style={styles.themeCol}>
          {(Object.keys(REPORT_THEMES) as ReportThemeKey[]).map((key) => {
            const t = REPORT_THEMES[key];
            const active = resolveThemeKey(options.themeKey) === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.themeCard, active && { borderColor: t.accent, borderWidth: 2 }]}
                activeOpacity={0.85}
                onPress={() => selectPreset(key)}
                testID={`theme-${key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${t.label} report preset`}
              >
                <View style={styles.themeCardTop}>
                  <View style={[styles.themeSwatch, { backgroundColor: t.primary }]}>
                    <View style={[styles.themeSwatchRule, { backgroundColor: t.accent }]} />
                    <View style={styles.themeSwatchLineWide} />
                    <View style={styles.themeSwatchLine} />
                  </View>
                  <View style={styles.themeCopy}>
                    <Text style={[styles.themeLabel, active && { color: t.primary }]}>{t.label}</Text>
                    <Text style={styles.themeDesc}>{getPresetSummary(key)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.activeSummary} testID="preset-summary">
          Selected: {REPORT_THEMES[resolveThemeKey(options.themeKey)].label} — {activeSummary}
        </Text>

        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setAdvancedOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: advancedOpen }}
          accessibilityLabel="Advanced options"
          testID="advanced-options-toggle"
        >
          {advancedOpen ? (
            <ChevronDown color={palette.textMuted} size={18} />
          ) : (
            <ChevronRight color={palette.textMuted} size={18} />
          )}
          <Text style={styles.advancedToggleText}>Advanced options</Text>
        </TouchableOpacity>

        {advancedOpen ? (
          <>
            <SectionTitle title="Sections" />
            <Card>
              <ToggleRow label="Cover page" value={options.coverPage} onToggle={(v) => set({ coverPage: v })} />
              <ToggleRow
                label="Summary & hit list table"
                value={options.includeSummary}
                onToggle={(v) => set({ includeSummary: v })}
              />
              <ToggleRow
                label="Item detail pages"
                value={options.includeDetails}
                onToggle={(v) => set({ includeDetails: v })}
              />
              <ToggleRow
                label="Signature block"
                value={options.includeSignature}
                onToggle={(v) => set({ includeSignature: v })}
              />
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
              <ToggleRow
                label="Timestamps"
                value={options.includeTimestamps}
                onToggle={(v) => set({ includeTimestamps: v })}
              />
              <ToggleRow
                label="Photo locations"
                value={options.includePhotoLocations}
                onToggle={(v) => set({ includePhotoLocations: v })}
              />
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
          </>
        ) : null}

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
  themeCol: { gap: spacing.sm },
  themeCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  themeCardTop: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  themeSwatch: {
    width: 64,
    height: 54,
    borderRadius: radius.sm,
    padding: 8,
    justifyContent: "flex-end",
    gap: 3,
  },
  themeSwatchRule: { width: 22, height: 3, borderRadius: 2, marginBottom: 2 },
  themeSwatchLineWide: { width: "78%", height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.75)" },
  themeSwatchLine: { width: "48%", height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" },
  themeCopy: { flex: 1 },
  themeLabel: { fontSize: font.size.md, fontFamily: font.family.bodyHeavy, color: palette.text },
  themeDesc: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 3, lineHeight: 16 },
  activeSummary: {
    fontSize: font.size.xs,
    color: palette.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  advancedToggleText: {
    fontSize: font.size.md,
    fontFamily: font.family.bodyHeavy,
    color: palette.text,
  },
  fieldLbl: {
    fontSize: font.size.xs,
    fontFamily: font.family.bodyBold,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  fieldSpacing: { marginTop: spacing.lg },
  previewBtn: { marginTop: spacing.lg },
});
