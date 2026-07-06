/** PDF Preview — generate, share, email and save the report. */

import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Stack, useLocalSearchParams } from "expo-router";
import { CheckCircle2, FileText, Mail, Share2 } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Card } from "@/components/ui";
import { STATUS_COLORS } from "@/components/pills";
import { BrandConfig, buildEmailBody, buildEmailSubject } from "@/constants/config";
import { font, palette, radius, spacing } from "@/constants/theme";
import { fileToDataUri, persistGeneratedPdf } from "@/lib/files";
import { formatDate, issueRef } from "@/lib/format";
import { buildReportHtml } from "@/lib/report";
import { useAppStore, useAudit, useIssuesForAudit, useProject } from "@/providers/AppStore";
import { DEFAULT_REPORT_OPTIONS, ReportOptions } from "@/types/models";

export default function ReportPreviewScreen() {
  const { id, options: optionsParam } = useLocalSearchParams<{ id: string; options?: string }>();
  const { db, settings, addReportExport } = useAppStore();
  const audit = useAudit(id);
  const project = useProject(audit?.projectId);
  const issues = useIssuesForAudit(id);

  const options: ReportOptions = useMemo(() => {
    try {
      if (optionsParam) return { ...DEFAULT_REPORT_OPTIONS, ...(JSON.parse(optionsParam) as ReportOptions) };
    } catch (e) {
      console.log("[preview] bad options param", e);
    }
    return settings.defaultReportOptions;
  }, [optionsParam, settings.defaultReportOptions]);

  const [generating, setGenerating] = useState<boolean>(false);
  const [pdfUri, setPdfUri] = useState<string | null>(null);

  const includedIssues = useMemo(
    () =>
      issues.filter(
        (i) => i.includeInReport && (options.includeCompleted || i.status !== "completed"),
      ),
    [issues, options.includeCompleted],
  );

  const photoCount = useMemo(
    () =>
      db.assets.filter((a) => includedIssues.some((i) => i.id === a.issueId) && !a.deletedAt).length,
    [db.assets, includedIssues],
  );

  const counts = useMemo(() => {
    const open = includedIssues.filter((i) => i.status === "open").length;
    const assigned = includedIssues.filter((i) => i.status === "assigned").length;
    const inProgress = includedIssues.filter((i) => i.status === "in_progress").length;
    const completed = includedIssues.filter((i) => i.status === "completed").length;
    return { open, assigned, inProgress, completed };
  }, [includedIssues]);

  const estimatedPages = useMemo(() => {
    let pages = 0;
    if (options.coverPage) pages += 1;
    if (options.includeSummary) pages += 1 + Math.floor(includedIssues.length / 28);
    if (options.includeDetails) pages += Math.max(1, Math.ceil(includedIssues.length / 2.5));
    return Math.max(1, pages);
  }, [options, includedIssues.length]);

  const estimatedSizeMb = useMemo(
    () => Math.max(0.3, (photoCount * 0.35 + 0.2)).toFixed(1),
    [photoCount],
  );

  const generate = useCallback(async (): Promise<string | null> => {
    if (!audit || !project) return null;
    try {
      setGenerating(true);

      // Resolve local images to data URIs so they embed in the PDF.
      const uriMap = new Map<string, string>();
      const relevantAssets = db.assets.filter(
        (a) => includedIssues.some((i) => i.id === a.issueId) && !a.deletedAt,
      );
      const urisToResolve = new Set<string>();
      relevantAssets.forEach((a) => urisToResolve.add(a.reportUri));
      if (project.coverPhotoUri) urisToResolve.add(project.coverPhotoUri);
      if (project.logoUri) urisToResolve.add(project.logoUri);
      await Promise.all(
        Array.from(urisToResolve).map(async (uri) => {
          const resolved = await fileToDataUri(uri);
          if (resolved) uriMap.set(uri, resolved);
        }),
      );

      const html = buildReportHtml({
        project,
        audit,
        issues: includedIssues,
        locations: db.locations.filter((l) => l.projectId === project.id),
        assignees: db.assignees,
        assets: relevantAssets,
        annotations: db.annotations,
        options,
        imageSrc: (uri) => uriMap.get(uri) ?? uri,
      });

      const result = await Print.printToFileAsync({ html, base64: false });
      const persisted = await persistGeneratedPdf(
        result.uri,
        `${BrandConfig.reportName}_${project.name}_${audit.auditDate}`,
      );
      setPdfUri(persisted);
      addReportExport({
        auditId: audit.id,
        projectId: project.id,
        pdfUri: persisted,
        issueCount: includedIssues.length,
        photoCount,
        options,
      });
      return persisted;
    } catch (e) {
      console.log("[preview] generate failed", e);
      Alert.alert("Generation failed", "Could not generate the PDF. Please try again.");
      return null;
    } finally {
      setGenerating(false);
    }
  }, [audit, project, db.assets, db.locations, db.assignees, db.annotations, includedIssues, options, photoCount, addReportExport]);

  const ensurePdf = useCallback(async (): Promise<string | null> => {
    return pdfUri ?? (await generate());
  }, [pdfUri, generate]);

  const share = useCallback(async () => {
    const uri = await ensurePdf();
    if (!uri) return;
    try {
      if (Platform.OS === "web") {
        Alert.alert("PDF ready", "On web, use your browser's print dialog to save the report.");
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (e) {
      console.log("[preview] share failed", e);
    }
  }, [ensurePdf]);

  const email = useCallback(async () => {
    if (!audit || !project) return;
    const uri = await ensurePdf();
    if (!uri) return;
    const subject = buildEmailSubject(project.name, formatDate(audit.auditDate));
    const body = buildEmailBody(
      project.name,
      formatDate(audit.auditDate),
      audit.preparedBy || project.inspectorName || settings.inspectorName,
    );
    try {
      const available = await MailComposer.isAvailableAsync();
      if (available) {
        await MailComposer.composeAsync({ subject, body, attachments: [uri] });
      } else {
        Alert.alert(
          "Mail not set up",
          "No mail account is configured on this device. The PDF is saved locally — use Share to send it through another app.",
        );
      }
    } catch (e) {
      console.log("[preview] email failed", e);
      Alert.alert("Email unavailable", "Could not open the mail composer. Use Share instead.");
    }
  }, [audit, project, ensurePdf, settings.inspectorName]);

  if (!audit || !project) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Audit not found.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "PDF Preview" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Cover preview */}
        <Card style={styles.coverCard}>
          <View style={styles.coverBand}>
            <View style={styles.coverMark}>
              <Text style={styles.coverMarkText}>{BrandConfig.monogram}</Text>
            </View>
            <View>
              <Text style={styles.coverBrand}>{project.companyName || BrandConfig.appName}</Text>
              <Text style={styles.coverTag}>{BrandConfig.reportName.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.coverTitle}>{audit.title}</Text>
          <Text style={styles.coverProject}>{project.name}</Text>
          {project.siteAddress ? <Text style={styles.coverAddress}>{project.siteAddress}</Text> : null}
          <View style={styles.coverMeta}>
            <Text style={styles.coverMetaText}>Prepared for {audit.preparedFor || project.clientName || "—"}</Text>
            <Text style={styles.coverMetaText}>By {audit.preparedBy || project.inspectorName || "—"} · {formatDate(audit.auditDate)}</Text>
          </View>
        </Card>

        {/* Summary preview */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Report contents</Text>
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{includedIssues.length}</Text>
              <Text style={styles.statLbl}>Items</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: palette.red }]}>{counts.open}</Text>
              <Text style={styles.statLbl}>Open</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: palette.amber }]}>{counts.assigned}</Text>
              <Text style={styles.statLbl}>Assigned</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: palette.info }]}>{counts.inProgress}</Text>
              <Text style={styles.statLbl}>In prog.</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: palette.green }]}>{counts.completed}</Text>
              <Text style={styles.statLbl}>Done</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>≈ {estimatedPages} pages</Text>
            <Text style={styles.metaText}>≈ {estimatedSizeMb} MB</Text>
            <Text style={styles.metaText}>{photoCount} photos</Text>
          </View>
        </Card>

        {/* Hit list preview — what the summary table will contain */}
        {includedIssues.length > 0 ? (
          <Card style={styles.hitCard}>
            <Text style={styles.summaryTitle}>Hit list preview</Text>
            {includedIssues.slice(0, 6).map((issue) => {
              const loc = db.locations.find((l) => l.id === issue.locationId)?.name ?? "General";
              return (
                <View key={issue.id} style={styles.hitRow}>
                  <View style={[styles.hitDot, { backgroundColor: STATUS_COLORS[issue.status].color }]} />
                  <Text style={styles.hitNum}>{issueRef(issue.issueNumber)}</Text>
                  <Text style={styles.hitTitle} numberOfLines={1}>
                    {issue.title || "Untitled issue"}
                  </Text>
                  <Text style={styles.hitLoc} numberOfLines={1}>
                    {loc}
                  </Text>
                </View>
              );
            })}
            {includedIssues.length > 6 ? (
              <Text style={styles.hitMore}>+ {includedIssues.length - 6} more items in the full report</Text>
            ) : null}
          </Card>
        ) : null}

        {pdfUri ? (
          <View style={styles.readyRow}>
            <CheckCircle2 color={palette.green} size={18} />
            <Text style={styles.readyText}>PDF ready locally · saved to reports</Text>
          </View>
        ) : null}

        <AppButton
          testID="generate-pdf"
          label={pdfUri ? "Regenerate PDF" : "Generate PDF"}
          icon={<FileText color={palette.white} size={18} />}
          onPress={generate}
          loading={generating}
        />
        <View style={styles.btnRow}>
          <AppButton
            label="Share"
            variant="secondary"
            icon={<Share2 color={palette.carbon} size={17} />}
            onPress={share}
            style={styles.halfBtn}
            disabled={generating}
          />
          <AppButton
            label="Email"
            variant="secondary"
            icon={<Mail color={palette.carbon} size={17} />}
            onPress={email}
            style={styles.halfBtn}
            disabled={generating}
          />
        </View>
        <Text style={styles.note}>
          Offline? The PDF is generated and stored on this device — share or email it whenever
          you&apos;re ready. Sending uses your own mail app.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 80, gap: spacing.md },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  coverCard: { padding: 0, overflow: "hidden" },
  coverBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: palette.carbon,
    padding: spacing.lg,
  },
  coverMark: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverMarkText: { color: palette.white, fontFamily: font.family.headingHeavy, fontSize: font.size.md },
  coverBrand: { color: palette.white, fontSize: font.size.md, fontFamily: font.family.headingHeavy },
  coverTag: { color: "rgba(255,255,255,0.65)", fontSize: 9, letterSpacing: 1.6, marginTop: 2, fontFamily: font.family.bodyBold },
  coverTitle: { fontSize: font.size.xl, fontFamily: font.family.headingHeavy, color: palette.text, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, letterSpacing: -0.3 },
  coverProject: { fontSize: font.size.md, fontFamily: font.family.bodySemibold, color: palette.textMuted, paddingHorizontal: spacing.lg, marginTop: 4 },
  coverAddress: { fontSize: font.size.xs, color: palette.textFaint, paddingHorizontal: spacing.lg, marginTop: 2 },
  coverMeta: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.surfaceAlt,
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: 3,
  },
  coverMetaText: { fontSize: font.size.xs, color: palette.textMuted },
  summaryCard: { gap: spacing.md },
  summaryTitle: { fontSize: font.size.sm, fontFamily: font.family.bodyHeavy, color: palette.text, textTransform: "uppercase", letterSpacing: 1 },
  statRow: { flexDirection: "row", gap: 6 },
  statBox: { flex: 1, alignItems: "center", backgroundColor: palette.surfaceAlt, borderRadius: radius.sm, paddingVertical: spacing.sm },
  statNum: { fontSize: font.size.lg, fontFamily: font.family.headingHeavy, color: palette.text },
  statLbl: { fontSize: 9, color: palette.textFaint, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: font.family.bodyBold, marginTop: 1 },
  metaRow: { flexDirection: "row", gap: spacing.lg },
  metaText: { fontSize: font.size.xs, color: palette.textMuted, fontFamily: font.family.bodySemibold },
  hitCard: { gap: spacing.sm },
  hitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hitDot: { width: 8, height: 8, borderRadius: 4 },
  hitNum: { fontSize: font.size.xs, fontFamily: font.family.headingHeavy, color: palette.textMuted, width: 36 },
  hitTitle: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.bodySemibold, color: palette.text },
  hitLoc: { fontSize: font.size.xs, color: palette.textFaint, maxWidth: 110 },
  hitMore: { fontSize: font.size.xs, color: palette.textFaint, marginTop: 2 },
  readyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  readyText: { fontSize: font.size.sm, color: palette.green, fontFamily: font.family.bodyBold },
  btnRow: { flexDirection: "row", gap: spacing.sm },
  halfBtn: { flex: 1 },
  note: { fontSize: font.size.xs, color: palette.textFaint, lineHeight: 17, textAlign: "center", marginTop: spacing.sm },
});
