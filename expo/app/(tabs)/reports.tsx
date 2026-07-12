/** Reports tab — build reports from audits and re-share past exports. */

import { useRouter } from "expo-router";
import { ChevronRight, FileText, Share2 } from "lucide-react-native";
import React, { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";

import { EmptyState, SectionTitle } from "@/components/ui";
import { font, palette, radius, spacing } from "@/constants/theme";
import { showAlert } from "@/lib/dialogs";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAppStore } from "@/providers/AppStore";
import type { ReportExport } from "@/types/models";

export default function ReportsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { db } = useAppStore();

  const audits = useMemo(
    () =>
      db.audits
        .filter((a) => !a.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [db.audits],
  );

  const exports = useMemo(
    () => db.reports.filter((r) => !r.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.reports],
  );

  const projectName = (id: string) => db.projects.find((p) => p.id === id)?.name ?? "Project";
  const auditTitle = (id: string) => db.audits.find((a) => a.id === id)?.title ?? "Audit";
  const issueCount = (auditId: string) =>
    db.issues.filter((i) => i.auditId === auditId && !i.deletedAt).length;

  /** Content changed after this PDF was generated → flag it as outdated. */
  const isExportStale = (exp: ReportExport): boolean => {
    const issues = db.issues.filter((i) => i.auditId === exp.auditId);
    const issueIds = new Set(issues.map((i) => i.id));
    const assets = db.assets.filter((a) => a.auditId === exp.auditId);
    const annotations = db.annotations.filter((an) => issueIds.has(an.issueId));
    return [...issues, ...assets, ...annotations].some((r) => r.updatedAt > exp.createdAt);
  };

  const sharePdf = async (uri: string) => {
    try {
      if (Platform.OS === "web") {
        showAlert("Not available", "Sharing saved PDFs is available on device.");
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (e) {
      console.log("[reports] share failed", e);
      showAlert("Share failed", "This report may have been removed from local storage. Regenerate it from the audit.");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.subtitle}>Turn any audit into a client-ready PDF.</Text>

      <SectionTitle title="Build a report" />
      {audits.length === 0 ? (
        <EmptyState
          icon={<FileText color={palette.textFaint} size={36} />}
          title="No audits yet"
          message="Create a project and start an audit to generate your first report."
        />
      ) : (
        audits.map((audit) => (
          <TouchableOpacity
            key={audit.id}
            style={styles.row}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: "/audit/[id]/report", params: { id: audit.id } })}
            testID={`report-audit-${audit.id}`}
          >
            <View style={styles.rowIcon}>
              <FileText color={palette.carbon} size={20} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {audit.title}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {projectName(audit.projectId)} · {formatDate(audit.auditDate)} · {issueCount(audit.id)} issues
              </Text>
            </View>
            <ChevronRight color={palette.textFaint} size={18} />
          </TouchableOpacity>
        ))
      )}

      <SectionTitle title="Generated reports" />
      {exports.length === 0 ? (
        <Text style={styles.emptyNote}>Generated PDFs will appear here for quick re-sharing.</Text>
      ) : (
        exports.map((exp) => (
          <View key={exp.id} style={styles.row}>
            <View style={[styles.rowIcon, styles.rowIconDone]}>
              <FileText color={palette.green} size={20} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {auditTitle(exp.auditId)}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {formatDateTime(exp.createdAt)} · {exp.issueCount} issues · {exp.photoCount} photos
              </Text>
              {isExportStale(exp) ? (
                <Text style={styles.rowStale} numberOfLines={1}>
                  Content changed since export — regenerate before issuing
                </Text>
              ) : null}
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={() => sharePdf(exp.pdfUri)} testID={`share-export-${exp.id}`}>
              <Share2 color={palette.carbon} size={18} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  title: { fontSize: font.size.xxl, fontFamily: font.family.headingHeavy, color: palette.text, letterSpacing: -0.7 },
  subtitle: { fontSize: font.size.sm, color: palette.textMuted, marginTop: 3 },
  row: {
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
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDone: { backgroundColor: palette.greenSoft },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: font.size.md, fontFamily: font.family.bodyBold, color: palette.text },
  rowSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
  rowStale: { fontSize: font.size.xs, color: palette.amber, fontFamily: font.family.bodyBold, marginTop: 2 },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceAlt,
  },
  emptyNote: { fontSize: font.size.sm, color: palette.textFaint, paddingVertical: spacing.md },
});
