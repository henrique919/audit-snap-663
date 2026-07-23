/** Project Dashboard — start audits, view reports, project stats. */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ClipboardList,
  FileText,
  Info,
  MapPin,
  Play,
  UsersRound,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppButton, Card, Chip, SectionTitle } from "@/components/ui";
import { font, palette, radius, spacing } from "@/constants/theme";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAppStore, useProject, useProjectStats } from "@/providers/AppStore";

export default function ProjectDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useAppStore();
  const project = useProject(id);
  const stats = useProjectStats(id);
  const [showInfo, setShowInfo] = useState<boolean>(false);

  const audits = useMemo(
    () =>
      db.audits
        .filter((a) => a.projectId === id && !a.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [db.audits, id],
  );
  const draftAudit = audits.find((a) => a.status === "draft") ?? null;
  const locations = useMemo(
    () => db.locations.filter((l) => l.projectId === id && !l.deletedAt),
    [db.locations, id],
  );
  const assignees = useMemo(() => db.assignees.filter((a) => !a.deletedAt), [db.assignees]);

  if (!project) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Project not found.</Text>
      </View>
    );
  }

  const issueCount = (auditId: string) =>
    db.issues.filter((i) => i.auditId === auditId && !i.deletedAt).length;

  return (
    <>
      <Stack.Screen options={{ title: project.name }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {project.clientName || project.siteAddress ? (
          <Text style={styles.subheader} numberOfLines={2}>
            {[project.clientName, project.siteAddress].filter(Boolean).join(" · ")}
          </Text>
        ) : null}

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.totalAudits}</Text>
            <Text style={styles.statLbl}>Audits</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, stats.openIssues > 0 && styles.statOpen]}>{stats.openIssues}</Text>
            <Text style={styles.statLbl}>Open</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, styles.statDone]}>{stats.completedIssues}</Text>
            <Text style={styles.statLbl}>Completed</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.reportsGenerated}</Text>
            <Text style={styles.statLbl}>Reports</Text>
          </View>
        </View>
        <Text style={styles.updated}>Last updated {formatDateTime(stats.lastUpdated)}</Text>

        <View style={styles.primaryActions}>
          <AppButton
            testID="start-audit"
            label="Start New Audit"
            icon={<ClipboardList color={palette.white} size={18} />}
            onPress={() => router.push({ pathname: "/audit-new", params: { projectId: project.id } })}
          />
          {draftAudit ? (
            <AppButton
              testID="continue-draft"
              label={`Continue “${draftAudit.title}”`}
              variant="secondary"
              icon={<Play color={palette.carbon} size={18} />}
              onPress={() => router.push({ pathname: "/capture-session", params: { auditId: draftAudit.id } })}
            />
          ) : null}
        </View>

        <SectionTitle title="Audits" />
        {audits.length === 0 ? (
          <Text style={styles.emptyNote}>No audits yet — start one above.</Text>
        ) : (
          audits.map((audit) => (
            <TouchableOpacity
              key={audit.id}
              style={styles.auditRow}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: "/audit/[id]/hitlist", params: { id: audit.id } })}
            >
              <View style={styles.auditBody}>
                <Text style={styles.auditTitle} numberOfLines={1}>
                  {audit.title}
                </Text>
                <Text style={styles.auditSub}>
                  {formatDate(audit.auditDate)} · {issueCount(audit.id)} issues ·{" "}
                  {audit.status === "draft" ? "Draft" : audit.status === "issued" ? "Report issued" : "Completed"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.auditReportBtn}
                onPress={() => router.push({ pathname: "/audit/[id]/report", params: { id: audit.id } })}
              >
                <FileText color={palette.carbon} size={18} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}

        <SectionTitle title="Setup" />
        <Card style={styles.setupCard}>
          <View style={styles.setupRow}>
            <MapPin color={palette.textMuted} size={16} />
            <Text style={styles.setupLabel}>Locations</Text>
            <Text style={styles.setupValue}>{locations.length}</Text>
          </View>
          <View style={styles.chipsWrap}>
            {locations.slice(0, 8).map((l) => (
              <Chip key={l.id} label={l.name} small />
            ))}
            {locations.length === 0 ? (
              <Text style={styles.emptyNote}>Locations are created on the fly during capture.</Text>
            ) : null}
          </View>
          <View style={[styles.setupRow, styles.setupRowSpaced]}>
            <UsersRound color={palette.textMuted} size={16} />
            <Text style={styles.setupLabel}>Assignees</Text>
            <Text style={styles.setupValue}>{assignees.length}</Text>
          </View>
          <View style={styles.chipsWrap}>
            {assignees.slice(0, 8).map((a) => (
              <Chip key={a.id} label={a.name} small />
            ))}
          </View>
        </Card>

        <TouchableOpacity style={styles.infoRow} activeOpacity={0.8} onPress={() => setShowInfo((v) => !v)}>
          <Info color={palette.textMuted} size={16} />
          <Text style={styles.infoLabel}>Project info</Text>
        </TouchableOpacity>
        {showInfo ? (
          <Card>
            {[
              ["Reference", project.reference],
              ["Client", project.clientName],
              ["Address", project.siteAddress],
              ["Company", project.companyName],
              ["Inspector", project.inspectorName],
            ].map(([label, value]) => (
              <View key={label} style={styles.infoLine}>
                <Text style={styles.infoKey}>{label}</Text>
                <Text style={styles.infoValue}>{value || "—"}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 80 },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  subheader: { fontSize: font.size.sm, color: palette.textMuted, marginBottom: spacing.lg },
  statGrid: { flexDirection: "row", gap: spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  statNum: { fontSize: font.size.xl, fontFamily: font.family.headingHeavy, color: palette.text },
  statOpen: { color: palette.red },
  statDone: { color: palette.green },
  statLbl: {
    fontSize: 10,
    color: palette.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: font.family.bodyBold,
    marginTop: 2,
  },
  updated: { fontSize: font.size.xs, color: palette.textFaint, marginTop: 6, marginBottom: spacing.lg },
  primaryActions: { gap: spacing.sm },
  auditRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  auditBody: { flex: 1 },
  auditTitle: { fontSize: font.size.md, fontFamily: font.family.heading, color: palette.text },
  auditSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
  auditReportBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  setupCard: { gap: spacing.sm },
  setupRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  setupRowSpaced: { marginTop: spacing.sm },
  setupLabel: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.bodyBold, color: palette.text },
  setupValue: { fontSize: font.size.sm, fontFamily: font.family.headingHeavy, color: palette.textMuted },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  emptyNote: { fontSize: font.size.xs, color: palette.textFaint },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  infoLabel: { fontSize: font.size.sm, fontFamily: font.family.bodyBold, color: palette.textMuted },
  infoLine: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.surfaceAlt },
  infoKey: { width: 90, fontSize: font.size.xs, color: palette.textFaint, fontFamily: font.family.bodyBold, textTransform: "uppercase", letterSpacing: 0.6 },
  infoValue: { flex: 1, fontSize: font.size.sm, color: palette.text, fontFamily: font.family.bodyMedium },
});
