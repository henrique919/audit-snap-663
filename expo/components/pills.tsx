/** Status / priority / sync pills used across lists and detail screens. */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { font, palette, radius } from "@/constants/theme";
import type { IssuePriority, IssueStatus, SyncStatus } from "@/types/models";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/types/models";

export const STATUS_COLORS: Record<IssueStatus, { color: string; soft: string }> = {
  open: { color: palette.red, soft: palette.redSoft },
  assigned: { color: palette.amber, soft: palette.amberSoft },
  in_progress: { color: palette.info, soft: palette.infoSoft },
  completed: { color: palette.green, soft: palette.greenSoft },
};

const PRIORITY_COLORS: Record<IssuePriority, { color: string; soft: string }> = {
  low: { color: palette.textMuted, soft: palette.surfaceAlt },
  medium: { color: palette.amber, soft: palette.amberSoft },
  high: { color: palette.red, soft: palette.redSoft },
};

export function StatusPill({ status }: { status: IssueStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <View style={[styles.pill, { backgroundColor: c.soft }]}>
      <View style={[styles.dot, { backgroundColor: c.color }]} />
      <Text style={[styles.label, { color: c.color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function PriorityPill({ priority }: { priority: IssuePriority }) {
  const c = PRIORITY_COLORS[priority];
  return (
    <View style={[styles.pill, { backgroundColor: c.soft }]}>
      <Text style={[styles.label, { color: c.color }]}>{PRIORITY_LABEL[priority]}</Text>
    </View>
  );
}

export function SyncPill({ status }: { status: SyncStatus }) {
  const isSynced = status === "synced";
  return (
    <View style={[styles.pill, { backgroundColor: isSynced ? palette.greenSoft : palette.surfaceAlt }]}>
      <View style={[styles.dot, { backgroundColor: isSynced ? palette.green : palette.textFaint }]} />
      <Text style={[styles.label, { color: isSynced ? palette.green : palette.textMuted }]}>
        {isSynced ? "Synced" : "On device"}
      </Text>
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
