/** PDF Preview — generate, share, email and save the report. */

import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Stack, useLocalSearchParams } from "expo-router";
import { AlertTriangle, CheckCircle2, FileText, Mail, Share2, ShieldCheck } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Card } from "@/components/ui";
import { STATUS_COLORS, StatusPill } from "@/components/pills";
import { BrandConfig, REPORT_THEMES, buildEmailBody, buildEmailSubject, resolveThemeKey } from "@/constants/config";
import { font, palette, radius, spacing } from "@/constants/theme";
import { fileToDataUri, persistGeneratedPdf } from "@/lib/files";
import { formatDate, formatDateTime, issueRef } from "@/lib/format";
import { buildReportHtml } from "@/lib/report";
import { useAppStore, useAudit, useIssuesForAudit, useProject, useReportFreshness } from "@/providers/AppStore";
import { DEFAULT_REPORT_OPTIONS, ReportOptions } from "@/types/models";

export default function ReportPreviewScreen() {
  const { id, options: optionsParam } = useLocalSearchParams<{ id: string; options?: string }>();
  const { db, settings, addReportExport } = useAppStore();
  const audit = useAudit(id);
  const project = useProject(audit?.projectId);
  const issues = useIssuesForAudit(id);
  const freshness = useReportFreshness(id);

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

  const theme = REPORT_THEMES[resolveThemeKey(options.themeKey)];
  const brandLogoUri = project?.logoUri ?? settings.logoUri;

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

  const sampleIssue = includedIssues[0] ?? null;
  const sampleAsset = useMemo(
    () => (sampleIssue ? (db.assets.find((a) => a.issueId === sampleIssue.id && !a.deletedAt) ?? null) : null),
    [db.assets, sampleIssue],
  );

  /** Whether any included photo carries a privacy blur — shown as a redaction guarantee. */
  const hasPrivacyBlur = useMemo(() => {
    const includedIds = new Set(includedIssues.map((i) => i.id));
    return db.annotations.some(
      (an) => includedIds.has(an.issueId) && an.elements.some((el) => el.type === "blur"),
    );
  }, [db.annotations, includedIssues]);

  const reportState: "none" | "ready" | "stale" =
    pdfUri || freshness.lastExport ? (freshness.isStale ? "stale" : "ready") : "none";

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
      if (settings.logoUri) urisToResolve.add(settings.logoUri);
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
        branding: {
          companyName: settings.companyName,
          inspectorName: settings.inspectorName,
          logoUri: settings.logoUri,
          footerText: settings.reportFooterText,
        },
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
  }, [audit, project, db.assets, db.locations, db.assignees, db.annotations, includedIssues, options, settings, photoCount, addReportExport]);

  const ensurePdf = useCallback(async (): Promise<string | null> => {
    if (pdfUri) return pdfUri;
    // Reuse the last export only when it is up to date AND was generated
    // with the same options — otherwise regenerate.
    if (
      freshness.lastExport &&
      !freshness.isStale &&
      Platform.OS !== "web" &&
      JSON.stringify(freshness.lastExport.options) === JSON.stringify(options)
    ) {
      return freshness.lastExport.pdfUri;
    }
    return generate();
  }, [pdfUri, freshness.lastExport, freshness.isStale, options, generate]);

  /**
   * Runs an action with a PDF, but never silently uses an outdated one:
   * if content changed since the last export, the user chooses to
   * regenerate or knowingly use the existing file.
   */
  const withFreshPdf = useCallback(
    async (action: (uri: string) => Promise<void>) => {
      const existingUri = pdfUri ?? freshness.lastExport?.pdfUri ?? null;
      if (freshness.isStale && existingUri) {
        Alert.alert(
          "Report out of date",
          "Issues, photos or markup changed since this PDF was generated. Regenerate to include the latest changes?",
          [
            {
              text: "Regenerate & Continue",
              onPress: async () => {
                const uri = await generate();
                if (uri) await action(uri);
              },
            },
            { text: "Use existing PDF", onPress: async () => action(existingUri) },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }
      const uri = await ensurePdf();
      if (uri) await action(uri);
    },
    [pdfUri, freshness.lastExport, freshness.isStale, generate, ensurePdf],
  );

  const doShare = useCallback(async (uri: string) => {
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
      Alert.alert("Share failed", "The saved PDF may have been removed. Regenerate and try again.");
    }
  }, []);

  const share = useCallback(() => withFreshPdf(doShare), [withFreshPdf, doShare]);

  const doEmail = useCallback(async (uri: string) => {
    if (!audit || !project) return;
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
  }, [audit, project, settings.inspectorName]);

  const email = useCallback(() => withFreshPdf(doEmail), [withFreshPdf, doEmail]);

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
        {/* Cover preview — reflects the selected report theme */}
        <Card style={styles.coverCard}>
          <View style={[styles.coverBand, { backgroundColor: theme.primary }]}>
            {brandLogoUri ? (
              <Image source={{ uri: brandLogoUri }} style={styles.coverLogo} resizeMode="contain" />
            ) : (
              <View style={styles.coverMark}>
                <Text style={styles.coverMarkText}>{BrandConfig.monogram}</Text>
              </View>
            )}
            <View style={styles.coverBrandBody}>
              <Text style={styles.coverBrand}>
                {project.companyName || settings.companyName || BrandConfig.appName}
              </Text>
              <Text style={styles.coverTag}>{BrandConfig.reportName.toUpperCase()}</Text>
            </View>
            <View style={[styles.coverThemeTag, { borderColor: theme.accent }]}>
              <Text style={[styles.coverThemeTagText, { color: theme.accent }]}>{theme.label}</Text>
            </View>
          </View>
          <View style={[styles.coverAccentRule, { backgroundColor: theme.accent }]} />
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

        {/* Item page preview — what a detail block looks like in the PDF */}
        {sampleIssue ? (
          <Card style={styles.itemCard}>
            <Text style={styles.summaryTitle}>Item page preview</Text>
            <View style={styles.itemRow}>
              {sampleAsset ? (
                <Image
                  source={{ uri: sampleAsset.annotatedUri ?? sampleAsset.thumbUri }}
                  style={styles.itemThumb}
                />
              ) : (
                <View style={[styles.itemThumb, styles.itemThumbEmpty]}>
                  <FileText color={palette.textFaint} size={18} />
                </View>
              )}
              <View style={styles.itemBody}>
                <View style={styles.itemTopRow}>
                  <Text style={styles.itemNum}>{issueRef(sampleIssue.issueNumber)}</Text>
                  <StatusPill status={sampleIssue.status} />
                </View>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {sampleIssue.title || "Untitled issue"}
                </Text>
                {sampleIssue.description ? (
                  <Text style={styles.itemDesc} numberOfLines={2}>
                    {sampleIssue.description}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.itemNote}>
              Each item gets a detail block like this
              {options.includeAnnotatedPhotos ? " — marked-up photos are used where available" : ""}.
            </Text>
          </Card>
        ) : null}

        {hasPrivacyBlur ? (
          <View style={styles.privacyRow}>
            <ShieldCheck color={palette.green} size={16} />
            <Text style={styles.privacyText}>
              Privacy blurs are permanently redacted in the exported PDF — including on original
              photos.
            </Text>
          </View>
        ) : null}

        {/* Report status */}
        <View style={[styles.statusRow, reportState === "stale" && styles.statusRowStale]}>
          {reportState === "stale" ? (
            <>
              <AlertTriangle color={palette.amber} size={18} />
              <View style={styles.statusBody}>
                <Text style={styles.statusStaleText}>Report needs regeneration</Text>
                <Text style={styles.statusSub}>
                  Content changed since the last PDF
                  {freshness.lastExport ? ` (${formatDateTime(freshness.lastExport.createdAt)})` : ""}.
                </Text>
              </View>
            </>
          ) : reportState === "ready" ? (
            <>
              <CheckCircle2 color={palette.green} size={18} />
              <View style={styles.statusBody}>
                <Text style={styles.readyText}>PDF ready · up to date</Text>
                <Text style={styles.statusSub}>
                  Saved on this device
                  {freshness.lastExport ? ` · ${formatDateTime(freshness.lastExport.createdAt)}` : ""}
                </Text>
              </View>
            </>
          ) : (
            <>
              <FileText color={palette.textFaint} size={18} />
              <View style={styles.statusBody}>
                <Text style={styles.statusNoneText}>No PDF generated yet</Text>
                <Text style={styles.statusSub}>Generate below — the PDF is created and stored on this device.</Text>
              </View>
            </>
          )}
        </View>

        <AppButton
          testID="generate-pdf"
          label={reportState === "none" ? "Generate PDF" : "Regenerate PDF"}
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
  coverLogo: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: palette.white },
  coverBrandBody: { flex: 1 },
  coverAccentRule: { height: 3 },
  coverThemeTag: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  coverThemeTagText: { fontSize: 10, fontFamily: font.family.bodyHeavy, textTransform: "uppercase", letterSpacing: 0.8 },
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
  itemCard: { gap: spacing.sm },
  itemRow: { flexDirection: "row", gap: spacing.md },
  itemThumb: { width: 76, height: 76, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt },
  itemThumbEmpty: { alignItems: "center", justifyContent: "center" },
  itemBody: { flex: 1, gap: 4 },
  itemTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemNum: { fontSize: font.size.xs, fontFamily: font.family.headingHeavy, color: palette.textMuted },
  itemTitle: { fontSize: font.size.sm, fontFamily: font.family.bodyBold, color: palette.text },
  itemDesc: { fontSize: font.size.xs, color: palette.textMuted, lineHeight: 16 },
  itemNote: { fontSize: font.size.xs, color: palette.textFaint },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.greenSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  privacyText: { flex: 1, fontSize: font.size.xs, color: palette.green, fontFamily: font.family.bodySemibold, lineHeight: 16 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusRowStale: { borderColor: palette.amber, backgroundColor: palette.amberSoft },
  statusBody: { flex: 1 },
  statusSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 1 },
  statusStaleText: { fontSize: font.size.sm, color: palette.amber, fontFamily: font.family.bodyBold },
  statusNoneText: { fontSize: font.size.sm, color: palette.textMuted, fontFamily: font.family.bodyBold },
  readyText: { fontSize: font.size.sm, color: palette.green, fontFamily: font.family.bodyBold },
  btnRow: { flexDirection: "row", gap: spacing.sm },
  halfBtn: { flex: 1 },
  note: { fontSize: font.size.xs, color: palette.textFaint, lineHeight: 17, textAlign: "center", marginTop: spacing.sm },
});
