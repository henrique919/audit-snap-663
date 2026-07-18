/** Project card for the home / project list screen. */

import { Image } from "expo-image";
import { Building2, ChevronRight, MapPin } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { SyncPill } from "@/components/pills";
import { font, palette, radius, shadow, spacing } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import type { Project } from "@/types/models";

interface ProjectCardProps {
  project: Project;
  openIssues: number;
  completedIssues: number;
  lastAuditDate: string | null;
  onPress: () => void;
}

function ProjectCardInner({ project, openIssues, completedIssues, lastAuditDate, onPress }: ProjectCardProps) {
  const accessibleLabel = [
    project.name,
    project.clientName || null,
    `${openIssues} open, ${completedIssues} completed issues`,
    `last audit ${formatDate(lastAuditDate)}`,
    project.syncStatus === "synced" ? "synced" : "on device only",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.card}
      testID={`project-card-${project.id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibleLabel}
    >
      <View style={styles.topRow}>
        {project.coverPhotoUri ? (
          <Image source={{ uri: project.coverPhotoUri }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Building2 color={palette.textFaint} size={22} />
          </View>
        )}
        <View style={styles.titleWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {project.name}
          </Text>
          {project.clientName ? (
            <Text style={styles.client} numberOfLines={1}>
              {project.clientName}
              {project.reference ? ` · ${project.reference}` : ""}
            </Text>
          ) : project.reference ? (
            <Text style={styles.client}>{project.reference}</Text>
          ) : null}
          {project.siteAddress ? (
            <View style={styles.addressRow}>
              <MapPin color={palette.textFaint} size={11} />
              <Text style={styles.address} numberOfLines={1}>
                {project.siteAddress}
              </Text>
            </View>
          ) : null}
        </View>
        <ChevronRight color={palette.textFaint} size={20} />
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statNum, openIssues > 0 && styles.statNumOpen]}>{openIssues}</Text>
          <Text style={styles.statLbl}>Open</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statNum, styles.statNumDone]}>{completedIssues}</Text>
          <Text style={styles.statLbl}>Completed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statWide}>
          <Text style={styles.statDate}>{formatDate(lastAuditDate)}</Text>
          <Text style={styles.statLbl}>Last audit</Text>
        </View>
        <SyncPill status={project.syncStatus} />
      </View>
    </TouchableOpacity>
  );
}

export const ProjectCard = React.memo(ProjectCardInner);

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cover: { width: 52, height: 52, borderRadius: radius.md },
  coverPlaceholder: {
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  titleWrap: { flex: 1 },
  name: { fontSize: font.size.lg, fontFamily: font.family.heading, color: palette.text, letterSpacing: -0.2 },
  client: { fontSize: font.size.sm, color: palette.textMuted, marginTop: 1 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  address: { fontSize: font.size.xs, color: palette.textFaint, flex: 1 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.surfaceAlt,
    gap: spacing.md,
  },
  stat: { alignItems: "flex-start" },
  statWide: { flex: 1 },
  statNum: { fontSize: font.size.lg, fontFamily: font.family.headingHeavy, color: palette.text },
  statNumOpen: { color: palette.red },
  statNumDone: { color: palette.green },
  statDate: { fontSize: font.size.sm, fontFamily: font.family.bodyBold, color: palette.text, marginTop: 2 },
  statLbl: {
    fontSize: 10,
    color: palette.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: font.family.bodyBold,
    marginTop: 1,
  },
  statDivider: { width: 1, height: 26, backgroundColor: palette.surfaceAlt },
});
