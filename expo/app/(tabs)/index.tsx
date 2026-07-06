/** Home / Project List — gets the user into a job fast. */

import { useRouter } from "expo-router";
import { FolderPlus, Play, Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/components/BrandMark";
import { ProjectCard } from "@/components/ProjectCard";
import { AppButton, EmptyState } from "@/components/ui";
import { BrandConfig } from "@/constants/config";
import { font, palette, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/providers/AppStore";
import type { Project } from "@/types/models";

export default function ProjectsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { db, settings, hydrated } = useAppStore();
  const [search, setSearch] = useState<string>("");

  const projects = useMemo(() => {
    const active = db.projects.filter((p) => !p.deletedAt && p.status === "active");
    const q = search.trim().toLowerCase();
    const filtered = q
      ? active.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.clientName.toLowerCase().includes(q) ||
            p.reference.toLowerCase().includes(q),
        )
      : active;
    return [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [db.projects, search]);

  const lastAudit = useMemo(
    () => db.audits.find((a) => a.id === settings.lastAuditId && !a.deletedAt && a.status === "draft") ?? null,
    [db.audits, settings.lastAuditId],
  );

  const statsFor = (project: Project) => {
    const issues = db.issues.filter((i) => i.projectId === project.id && !i.deletedAt);
    const audits = db.audits.filter((a) => a.projectId === project.id && !a.deletedAt);
    const lastAuditDate = audits.reduce<string | null>(
      (acc, a) => (acc === null || a.auditDate > acc ? a.auditDate : acc),
      null,
    );
    return {
      open: issues.filter((i) => i.status !== "completed").length,
      completed: issues.filter((i) => i.status === "completed").length,
      lastAuditDate,
    };
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <BrandMark size={42} />
        <View style={styles.headerText}>
          <Text style={styles.appName}>{BrandConfig.appName}</Text>
          <Text style={styles.tagline}>{BrandConfig.tagline}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search color={palette.textFaint} size={18} />
        <TextInput
          testID="project-search"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search projects, clients, references"
          placeholderTextColor={palette.textFaint}
        />
      </View>

      <View style={styles.actionRow}>
        <AppButton
          testID="new-project"
          label="New Project"
          icon={<FolderPlus color={palette.white} size={18} />}
          onPress={() => router.push("/project-new")}
          style={styles.actionBtn}
        />
        {lastAudit ? (
          <AppButton
            testID="continue-audit"
            label="Continue Audit"
            variant="secondary"
            icon={<Play color={palette.carbon} size={18} />}
            onPress={() => router.push({ pathname: "/capture-session", params: { auditId: lastAudit.id } })}
            style={styles.actionBtn}
          />
        ) : null}
      </View>

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const s = statsFor(item);
          return (
            <ProjectCard
              project={item}
              openIssues={s.open}
              completedIssues={s.completed}
              lastAuditDate={s.lastAuditDate}
              onPress={() => router.push({ pathname: "/project/[id]", params: { id: item.id } })}
            />
          );
        }}
        ListEmptyComponent={
          hydrated ? (
            <EmptyState
              title={search ? "No matching projects" : "No projects yet"}
              message={
                search
                  ? "Try a different search term."
                  : "Create your first project to start capturing site issues."
              }
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  appName: { fontSize: font.size.xl, fontFamily: font.family.headingHeavy, color: palette.text, letterSpacing: -0.7 },
  tagline: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 1 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    height: 46,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: font.size.md, color: palette.text },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  actionBtn: { flex: 1 },
  listContent: { paddingBottom: 120 },
});
