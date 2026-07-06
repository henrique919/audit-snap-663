/** Hit List — review, filter and manage all issues in an audit. */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Camera, ClipboardList, FileText } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

import { IssueCard } from "@/components/IssueCard";
import { AppButton, Chip, EmptyState } from "@/components/ui";
import { font, palette, spacing } from "@/constants/theme";
import { issueRef } from "@/lib/format";
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
    Alert.alert("Change status", `${issueRef(issue.issueNumber)} · ${issue.title || "Untitled issue"}`, [
      ...(Object.keys(STATUS_LABEL) as IssueStatus[]).map((s) => ({
        text: s === issue.status ? `${STATUS_LABEL[s]} ✓` : STATUS_LABEL[s],
        onPress: () => updateIssue(issue.id, { status: s }),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const quickActions = (issue: Issue) => {
    const firstAsset = db.assets.find((a) => a.issueId === issue.id && !a.deletedAt) ?? null;
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
        onPress: () =>
          Alert.alert("Delete issue?", `${issueRef(issue.issueNumber)} will be removed from the audit and report.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => deleteIssue(issue.id) },
          ]),
      },
      { text: "Cancel", style: "cancel" as const },
    ];
    Alert.alert(issueRef(issue.issueNumber), issue.title || "Untitled issue", buttons);
  };

  if (!audit) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Audit not found.</Text>
      </View>
    );
  }

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
            const assets = db.assets.filter((a) => a.issueId === issue.id && !a.deletedAt);
            const hasMarkup = db.annotations.some(
              (an) => an.issueId === issue.id && an.elements.length > 0,
            );
            return (
              <IssueCard
                issue={issue}
                assets={assets}
                locationName={locationName(issue.locationId)}
                assigneeName={assigneeName(issue.assigneeId)}
                hasMarkup={hasMarkup}
                onPress={() => router.push({ pathname: "/issue/[id]", params: { id: issue.id } })}
                onLongPress={() => quickActions(issue)}
              />
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<ClipboardList color={palette.textFaint} size={36} />}
              title="No issues yet"
              message="Capture photos on your site walk to build the hit list."
            />
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
  footerBtnWide: { flex: 1.5 },
});
