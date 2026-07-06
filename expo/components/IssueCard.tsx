/** Issue card for the hit list. */

import { Image } from "expo-image";
import { Camera, EyeOff, MapPin, PenLine, UserRound } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { PriorityPill, StatusPill } from "@/components/pills";
import { font, palette, radius, spacing } from "@/constants/theme";
import { issueRef } from "@/lib/format";
import type { Issue, PhotoAsset } from "@/types/models";

interface IssueCardProps {
  issue: Issue;
  assets: PhotoAsset[];
  locationName: string;
  assigneeName: string;
  hasMarkup: boolean;
  onPress: () => void;
}

function IssueCardInner({ issue, assets, locationName, assigneeName, hasMarkup, onPress }: IssueCardProps) {
  const thumb = assets[0]?.thumbUri;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.card, !issue.includeInReport && styles.excluded]} testID={`issue-card-${issue.id}`}>
      <View style={styles.thumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Camera color={palette.textFaint} size={18} />
          </View>
        )}
        {assets.length > 1 ? (
          <View style={styles.photoCount}>
            <Text style={styles.photoCountText}>{assets.length}</Text>
          </View>
        ) : null}
        {hasMarkup ? (
          <View style={styles.markupBadge}>
            <PenLine color={palette.white} size={10} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.number}>{issueRef(issue.issueNumber)}</Text>
          {!issue.includeInReport ? <EyeOff color={palette.textFaint} size={13} /> : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {issue.title || "Untitled issue"}
        </Text>
        <View style={styles.metaRow}>
          <MapPin color={palette.textFaint} size={11} />
          <Text style={styles.metaText} numberOfLines={1}>
            {locationName}
          </Text>
          <UserRound color={palette.textFaint} size={11} />
          <Text style={styles.metaText} numberOfLines={1}>
            {assigneeName}
          </Text>
        </View>
        <View style={styles.pillRow}>
          <StatusPill status={issue.status} />
          <PriorityPill priority={issue.priority} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const IssueCard = React.memo(IssueCardInner);

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  excluded: { opacity: 0.55 },
  thumbWrap: { position: "relative" },
  thumb: { width: 82, height: 82, borderRadius: radius.md },
  thumbPlaceholder: {
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  photoCount: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(14,27,46,0.85)",
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  photoCountText: { color: palette.white, fontSize: 10, fontWeight: font.weight.bold },
  markupBadge: {
    position: "absolute",
    left: 4,
    top: 4,
    backgroundColor: palette.green,
    borderRadius: radius.pill,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, paddingVertical: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  number: {
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy,
    color: palette.textFaint,
    letterSpacing: 0.5,
  },
  title: { fontSize: font.size.md, fontWeight: font.weight.bold, color: palette.text, marginTop: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  metaText: { fontSize: font.size.xs, color: palette.textMuted, marginRight: 8, maxWidth: 110 },
  pillRow: { flexDirection: "row", gap: 6, marginTop: 6 },
});
