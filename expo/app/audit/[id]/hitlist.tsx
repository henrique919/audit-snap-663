/** Hit List — review, filter and manage all issues in an audit. */

import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Camera, ClipboardList, Download, FileText } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

import { IssueCard } from "@/components/IssueCard";
import { AppButton, Chip, EmptyState } from "@/components/ui";
import { font, palette, spacing } from "@/constants/theme";
import { buildCsv, exportCsv } from "@/lib/csv";
import { showActions, showAlert, showConfirm } from "@/lib/dialogs";
import { isEntitled } from "@/lib/entitlements";
import { issueRef } from "@/lib/format";
import { buildIssueMediaIndex } from "@/lib/issueIndex";
import { useAppStore, useAudit, useIssuesForAudit } from "@/providers/AppStore";
import type { Issue, IssueStatus } from "@/types/models";
import { STATUS_LABEL } from "@/types/models";

type ViewMode = "all" | "location" | "assignee" | "status";

export default function HitListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db, updateIssue, duplicateIssue, deleteIssue } = useAppStore();
  const audit = useAudit(id);
  const issues = useIssuesForAudit(id);

  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | null>(null);
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);

  const issueMediaIndex = useMemo(
    () => buildIssueMediaIndex(db.assets, db.annotations),
    [db.assets, db.annotations],
  );

  const locationName = (locId: string | null) =>
    db.locations.find((l) => l.id === locId)?.name ?? "General";
  const assigneeName = (aId: string | null) =>
    db.assignees.find((a) => a.id === aId)?.name ?? "Unassigned";

  const filtered = useMemo(() => {
    let list = issues;
    if (statusFilter) list = list.filter((i) => i.status === statusFilter);
    return list;
  }, [issues, statusFilter]);

  const sections = useMemo(() => {
    if (viewMode === "all") return [{ key: "All issues", data: filtered }];
    const map = new Map<string, Issue[]>();
    for (const issue of filtered) {
      const key =
        viewMode === "location"
          ? locationName(issue.locationId)
          : viewMode === "assignee"
            ? assigneeName(issue.assigneeId)
            : STATUS_LABEL[issue.status];
      const arr = map.get(key) ?? [];
      arr.push(issue);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, data]) => ({ key, data }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, viewMode, db.locations, db.assignees]);

  const openCount = issues.filter((i) => i.status !== "completed").length;
  const doneCount = issues.length - openCount;

  const changeStatus = (issue: Issue) => {
    showActions(
      "Change status",
      `${issueRef(issue.issueNumber)} · ${issue.title || "Untitled issue"}`,
      [
        ...(Object.keys(STATUS_LABEL) as IssueStatus[]).map((s) => ({
          text: s === issue.status ? `${STATUS_LABEL[s]} ✓` : STATUS_LABEL[s],
          onPress: () => updateIssue(issue.id, { status: s }),
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  const confirmDeleteIssue = async (issue: Issue) => {
    const ok = await showConfirm(
      "Delete issue?",
      `${issueRef(issue.issueNumber)} will be removed from the audit and report.`,
      "Delete",
      true,
    );
    if (ok) deleteIssue(issue.id);
  };

  const quickActions = (issue: Issue) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const firstAsset = issueMediaIndex.assetsByIssue.get(issue.id)?.[0] ?? null;
    const buttons = [
      { text: "Change status", onPress: () => changeStatus(issue) },
      ...(firstAsset
        ? [
            {
              text: "Mark up photo",
              onPress: () =>
                router.push({ pathname: "/markup/[assetId]" as const, params: { assetId: firstAsset.id } }),
            },
          ]
        : []),
      {
        text: issue.includeInReport ? "Exclude from report" : "Include in report",
        onPress: () => updateIssue(issue.id, { includeInReport: !issue.includeInReport }),
      },
      {
        text: "Duplicate",
        onPress: () => {
          const copy = duplicateIssue(issue.id);
          if (copy) router.push({ pathname: "/issue/[id]" as const, params: { id: copy.id } });
        },
      },
      {
        text: "Delete",
        style: "destructive" as const,
        onPress: () => confirmDeleteIssue(issue),
      },
      { text: "Cancel", style: "cancel" as const },
    ];
    showActions(issueRef(issue.issueNumber), issue.title || "Untitled issue", buttons);
  };

  if (!audit) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Audit not found.</Text>
      </View>
    );
  }

  const exportHitListCsv = async () => {
    if (!isEntitled("csv_export")) {
      showAlert("Not available", "CSV export isn't available on your plan.");
      return;
    }
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const csv = buildCsv(issues, db.locations, db.assignees);
      const safeName = audit.title.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "audit";
      const ok = await exportCsv(csv, `${safeName}_hitlist.csv`);
      if (!ok) {
        showAlert("Export unavailable", "Sharing isn't available on this device.");
      }
    } catch (e) {
      console.log("[hitlist] CSV export failed", e);
      showAlert("Export failed", "Could not export the hit list. Please try again.");
    } finally {
      setExportingCsv(false);
    }
  };

  const flatData: ({ type: "header"; title: string; count: number } | { type: "issue"; issue: Issue })[] = [];
  for (const section of sections) {
    if (viewMode !== "all") flatData.push({ type: "header", title: section.key, count: section.data.length });
    for (const issue of section.data) flatData.push({ type: "issue", issue });
  }

  return (
    <>
      <Stack.Screen options={{ title: audit.title }} />
      <View style={styles.container}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryStrong}>{issues.length}</Text> issues ·{" "}
            <Text style={[styles.summaryStrong, styles.openColor]}>{openCount}</Text> open ·{" "}
            <Text style={[styles.summaryStrong, styles.doneColor]}>{doneCount}</Text> completed
          </Text>
          <Text style={styles.summaryHint}>Hold an issue for quick actions</Text>
        </View>

        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Chip label="All" small active={viewMode === "all"} onPress={() => setViewMode("all")} />
            <Chip label="By location" small active={viewMode === "location"} onPress={() => setViewMode("location")} />
            <Chip label="By assignee" small active={viewMode === "assignee"} onPress={() => setViewMode("assignee")} />
            <Chip label="By status" small active={viewMode === "status"} onPress={() => setViewMode("status")} />
            <View style={styles.filterDivider} />
            {(Object.keys(STATUS_LABEL) as IssueStatus[]).map((s) => (
              <Chip
                key={s}
                label={STATUS_LABEL[s]}
                small
                active={statusFilter === s}
                onPress={() => setStatusFilter(statusFilter === s ? null : s)}
              />
            ))}
          </ScrollView>
        </View>

        <FlatList
          data={flatData}
          keyExtractor={(item, index) => (item.type === "issue" ? item.issue.id : `h-${item.title}-${index}`)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                  <Text style={styles.sectionCount}>{item.count}</Text>
                </View>
              );
            }
            const issue = item.issue;
            const assets = issueMediaIndex.assetsByIssue.get(issue.id) ?? [];
            const hasMarkup = issueMediaIndex.hasMarkupByIssue.has(issue.id);
            return (
              <IssueCard
                issue={issue}
                assets={assets}
                locationName={locationName(issue.locationId)}
                assigneeName={assigneeName(issue.assigneeId)}
                hasMarkup={hasMarkup}
                onPress={() => router.push({ pathname: "/issue/[id]", params: { id: issue.id } })}
                onLongPress={() => quickActions(issue)}
                onMore={() => quickActions(issue)}
              />
            );
          }}
          ListEmptyComponent={
            issues.length === 0 ? (
              <EmptyState
                icon={<ClipboardList color={palette.textFaint} size={36} />}
                title="No issues yet"
                message="Capture photos on your site walk to build the hit list."
              />
            ) : (
              <EmptyState
                icon={<ClipboardList color={palette.textFaint} size={36} />}
                title="No issues match this filter"
                message={`No ${statusFilter ? STATUS_LABEL[statusFilter].toLowerCase() : ""} issues yet — try a different status filter above.`}
              />
            )
          }
        />

        <View style={styles.footer}>
          <AppButton
            label="Capture"
            variant="secondary"
            icon={<Camera color={palette.carbon} size={18} />}
            onPress={() => router.push({ pathname: "/capture-session", params: { auditId: audit.id } })}
            style={styles.footerBtn}
          />
          <AppButton
            testID="export-csv"
            label="CSV"
            variant="secondary"
            icon={<Download color={palette.carbon} size={18} />}
            onPress={exportHitListCsv}
            loading={exportingCsv}
            disabled={issues.length === 0}
            style={styles.footerBtnNarrow}
          />
          <AppButton
            testID="build-report"
            label="Build Report"
            icon={<FileText color={palette.white} size={18} />}
            onPress={() => router.push({ pathname: "/audit/[id]/report", params: { id: audit.id } })}
            style={styles.footerBtnWide}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  summaryRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  summaryText: { fontSize: font.size.sm, color: palette.textMuted },
  summaryHint: { fontSize: font.size.xs, color: palette.textFaint, marginTop: 2 },
  summaryStrong: { fontFamily: font.family.bodyHeavy, color: palette.text },
  openColor: { color: palette.red },
  doneColor: { color: palette.green },
  filterBar: { paddingVertical: spacing.sm },
  filterRow: { gap: 6, paddingHorizontal: spacing.lg, alignItems: "center" },
  filterDivider: { width: 1, height: 20, backgroundColor: palette.borderStrong, marginHorizontal: 4 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 110 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: font.size.sm,
    fontFamily: font.family.bodyHeavy,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionCount: { fontSize: font.size.sm, fontFamily: font.family.bodyHeavy, color: palette.textFaint },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: palette.background,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  footerBtn: { flex: 1 },
  footerBtnNarrow: { flex: 0.7 },
  footerBtnWide: { flex: 1.5 },
});
