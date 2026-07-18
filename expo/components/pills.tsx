/** Status / priority / sync pills used across lists and detail screens. */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { font, palette, radius } from "@/constants/theme";
import type { IssuePriority, IssueStatus, SyncStatus } from "@/types/models";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/types/models";

// `amber`/`cobalt` are fills, not AA-safe text colours (see theme.ts) — the
// pill/spine text roles use the darker amberText/cobaltText variants.
export const STATUS_COLORS: Record<IssueStatus, { color: string; soft: string }> = {
  open: { color: palette.red, soft: palette.redSoft },
  assigned: { color: palette.amberText, soft: palette.amberSoft },
  in_progress: { color: palette.cobaltText, soft: palette.cobaltSoft },
  completed: { color: palette.green, soft: palette.greenSoft },
};

const PRIORITY_COLORS: Record<IssuePriority, { color: string; soft: string }> = {
  low: { color: "#5A6570", soft: palette.surfaceAlt },
  medium: { color: palette.amberText, soft: palette.amberSoft },
  high: { color: palette.red, soft: palette.redSoft },
};

export function StatusPill({ status }: { status: IssueStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <View
      style={[styles.pill, { backgroundColor: c.soft }]}
      accessible
      accessibilityLabel={`Status: ${STATUS_LABEL[status]}`}
    >
      <View style={[styles.dot, { backgroundColor: c.color }]} />
      <Text style={[styles.label, { color: c.color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function PriorityPill({ priority }: { priority: IssuePriority }) {
  const c = PRIORITY_COLORS[priority];
  return (
    <View
      style={[styles.pill, { backgroundColor: c.soft }]}
      accessible
      accessibilityLabel={`Priority: ${PRIORITY_LABEL[priority]}`}
    >
      <Text style={[styles.label, { color: c.color }]}>{PRIORITY_LABEL[priority]}</Text>
    </View>
  );
}

export function SyncPill({ status }: { status: SyncStatus }) {
  const isSynced = status === "synced";
  const label = isSynced ? "Synced" : "On device";
  return (
    <View
      style={[styles.pill, { backgroundColor: isSynced ? palette.greenSoft : palette.surfaceAlt }]}
      accessible
      accessibilityLabel={`Sync status: ${label}`}
    >
      <View style={[styles.dot, { backgroundColor: isSynced ? palette.green : palette.textFaint }]} />
      <Text style={[styles.label, { color: isSynced ? palette.green : palette.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: {
    fontSize: font.size.xs,
    fontFamily: font.family.bodyBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
