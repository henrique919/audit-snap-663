/** Capture tab — jump straight into the most recent draft audit or start one. */

import { useRouter } from "expo-router";
import { Camera, ChevronRight, ClipboardList, FolderPlus, Play } from "lucide-react-native";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Card, EmptyState, SectionTitle } from "@/components/ui";
import { font, palette, radius, spacing } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import { useAppStore } from "@/providers/AppStore";

export default function CaptureTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { db } = useAppStore();

  const draftAudits = useMemo(
    () =>
      db.audits
        .filter((a) => !a.deletedAt && a.status === "draft")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [db.audits],
  );

  const projects = useMemo(
    () =>
      db.projects
        .filter((p) => !p.deletedAt && p.status === "active")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [db.projects],
  );

  const projectName = (id: string) => db.projects.find((p) => p.id === id)?.name ?? "Project";
  const issueCount = (auditId: string) =>
    db.issues.filter((i) => i.auditId === auditId && !i.deletedAt).length;

  const latest = draftAudits[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Capture</Text>
      <Text style={styles.subtitle}>Walk the site. Photograph issues. Build the hit list.</Text>

      {latest ? (
        <Card style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Camera color={palette.white} size={22} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {latest.title}
              </Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {projectName(latest.projectId)} · {formatDate(latest.auditDate)} · {issueCount(latest.id)} issues
              </Text>
            </View>
          </View>
          <AppButton
            testID="capture-continue"
            label="Continue Capture"
            icon={<Play color={palette.white} size={18} />}
            onPress={() => router.push({ pathname: "/capture-session", params: { auditId: latest.id } })}
          />
        </Card>
      ) : (
        <EmptyState
          icon={<ClipboardList color={palette.textFaint} size={36} />}
          title="No draft audits"
          message="Start an audit from a project below to begin capturing."
        />
      )}

      {draftAudits.length > 1 ? (
        <>
          <SectionTitle title="Other draft audits" />
          {draftAudits.slice(1).map((audit) => (
            <TouchableOpacity
              key={audit.id}
              style={styles.row}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: "/capture-session", params: { auditId: audit.id } })}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {audit.title}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {projectName(audit.projectId)} · {issueCount(audit.id)} issues
                </Text>
              </View>
              <ChevronRight color={palette.textFaint} size={18} />
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      <SectionTitle title="Start a new audit" />
      {projects.map((project) => (
        <TouchableOpacity
          key={project.id}
          style={styles.row}
          activeOpacity={0.8}
          onPress={() => router.push({ pathname: "/audit-new", params: { projectId: project.id } })}
        >
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {project.name}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {project.clientName || project.reference || "Tap to start an audit"}
            </Text>
          </View>
          <ChevronRight color={palette.textFaint} size={18} />
        </TouchableOpacity>
      ))}
      {projects.length === 0 ? (
        <AppButton
          label="Create a Project First"
          variant="secondary"
          icon={<FolderPlus color={palette.navy} size={18} />}
          onPress={() => router.push("/project-new")}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: palette.text, letterSpacing: -0.4 },
  subtitle: { fontSize: font.size.sm, color: palette.textMuted, marginTop: 3, marginBottom: spacing.lg },
  heroCard: { gap: spacing.md },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: palette.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: palette.text },
  heroSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
  row: {
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
  rowBody: { flex: 1 },
  rowTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: palette.text },
  rowSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
});
