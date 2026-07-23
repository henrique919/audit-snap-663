/** Capture tab — Quick Walk (LP-20) plus continue draft / full audit start. */

import { useRouter } from "expo-router";
import { Camera, ChevronRight, ClipboardList, FolderPlus, Play, Zap } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Card, Chip, EmptyState, Field, SectionTitle } from "@/components/ui";
import { font, palette, radius, spacing } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import {
  buildQuickWalkAuditInput,
  buildQuickWalkProjectInput,
  shouldStartQuickWalkWithNewProject,
} from "@/lib/quickWalk";
import { useAppStore } from "@/providers/AppStore";

const NAME_MAX = 80;

export default function CaptureTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { db, settings, createProject, createAudit } = useAppStore();

  const [quickOpen, setQuickOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [starting, setStarting] = useState(false);

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
  const usingNewProject = selectedProjectId === null;
  const nameError =
    attempted && usingNewProject && !newProjectName.trim()
      ? "Enter a project name to start."
      : undefined;

  const openQuickWalk = () => {
    setQuickOpen(true);
    setAttempted(false);
    if (!shouldStartQuickWalkWithNewProject(projects) && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
      setNewProjectName("");
    } else {
      setSelectedProjectId(null);
    }
  };

  const startQuickWalk = () => {
    setAttempted(true);
    if (starting) return;

    let project = selectedProjectId
      ? db.projects.find((p) => p.id === selectedProjectId && !p.deletedAt) ?? null
      : null;

    if (!project) {
      if (!newProjectName.trim()) return;
      project = createProject(buildQuickWalkProjectInput(newProjectName, settings));
    }

    setStarting(true);
    try {
      const audit = createAudit(buildQuickWalkAuditInput(project, settings));
      const walkStartedAt = String(Date.now());
      router.push({
        pathname: "/capture-session",
        params: { auditId: audit.id, quickWalk: "1", walkStartedAt },
      });
      setQuickOpen(false);
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Capture</Text>
      <Text style={styles.subtitle}>Walk the site. Photograph issues. Build the hit list.</Text>

      <Card style={styles.quickCard}>
        <View style={styles.quickTop}>
          <View style={styles.quickIcon}>
            <Zap color={palette.white} size={22} />
          </View>
          <View style={styles.quickText}>
            <Text style={styles.quickTitle}>Quick Walk</Text>
            <Text style={styles.quickSub}>Name a project → camera. First issue in under a minute.</Text>
          </View>
        </View>
        {!quickOpen ? (
          <AppButton
            testID="quick-walk-open"
            label="Quick Walk"
            icon={<Zap color={palette.white} size={18} />}
            onPress={openQuickWalk}
          />
        ) : (
          <View style={styles.quickForm} accessibilityRole="none">
            {projects.length > 0 ? (
              <>
                <Text style={styles.fieldLabel}>Project</Text>
                <View style={styles.chipWrap}>
                  {projects.slice(0, 8).map((p) => (
                    <Chip
                      key={p.id}
                      label={p.name}
                      small
                      active={selectedProjectId === p.id}
                      onPress={() => {
                        setSelectedProjectId(p.id);
                        setNewProjectName("");
                      }}
                    />
                  ))}
                  <Chip
                    label="New project"
                    small
                    active={selectedProjectId === null}
                    onPress={() => setSelectedProjectId(null)}
                  />
                </View>
              </>
            ) : null}
            {usingNewProject ? (
              <Field
                label={projects.length === 0 ? "Project name" : "New project name"}
                value={newProjectName}
                onChangeText={setNewProjectName}
                placeholder="e.g. Harbourview Stage 2"
                testID="quick-walk-project-name"
                error={nameError}
                maxLength={NAME_MAX}
              />
            ) : null}
            <AppButton
              testID="quick-walk-start"
              label="Start capture"
              icon={<Camera color={palette.white} size={18} />}
              onPress={startQuickWalk}
              loading={starting}
            />
            <AppButton label="Cancel" variant="ghost" onPress={() => setQuickOpen(false)} />
          </View>
        )}
      </Card>

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
                {projectName(latest.projectId)} · {formatDate(latest.auditDate)} · {issueCount(latest.id)}{" "}
                issues
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
          message="Use Quick Walk above, or start a full audit from a project below."
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
              {project.clientName || project.reference || "Full setup form"}
            </Text>
          </View>
          <ChevronRight color={palette.textFaint} size={18} />
        </TouchableOpacity>
      ))}
      {projects.length === 0 ? (
        <AppButton
          label="Create a Project First"
          variant="secondary"
          icon={<FolderPlus color={palette.carbon} size={18} />}
          onPress={() => router.push("/project-new")}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  title: {
    fontSize: font.size.xxl,
    fontFamily: font.family.headingHeavy,
    color: palette.text,
    letterSpacing: -0.7,
  },
  subtitle: { fontSize: font.size.sm, color: palette.textMuted, marginTop: 3, marginBottom: spacing.lg },
  quickCard: { gap: spacing.md, marginBottom: spacing.md },
  quickTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  quickIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: palette.cobalt,
    alignItems: "center",
    justifyContent: "center",
  },
  quickText: { flex: 1 },
  quickTitle: { fontSize: font.size.lg, fontFamily: font.family.heading, color: palette.text },
  quickSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
  quickForm: { gap: spacing.sm },
  fieldLabel: {
    fontSize: font.size.xs,
    fontFamily: font.family.bodyHeavy,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  heroCard: { gap: spacing.md },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: palette.carbon,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: font.size.lg, fontFamily: font.family.heading, color: palette.text },
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
  rowTitle: { fontSize: font.size.md, fontFamily: font.family.bodyBold, color: palette.text },
  rowSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
});
