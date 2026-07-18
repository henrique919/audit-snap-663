/**
 * Issue card for the hit list — status spine on the left edge, annotated
 * thumbnail preferred over the original photo, "Marked up" badge.
 */

import { Image } from "expo-image";
import { Camera, EyeOff, MapPin, MoreVertical, PenLine, UserRound } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { PriorityPill, STATUS_COLORS, StatusPill } from "@/components/pills";
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
  /** Long-press opens the quick actions sheet (status, markup, duplicate…). */
  onLongPress?: () => void;
  /** Explicit tap trigger for quick actions — the reliable entry point on
   * web/desktop, where long-press via mouse-hold is easy to misfire. */
  onMore?: () => void;
}

function IssueCardInner({
  issue,
  assets,
  locationName,
  assigneeName,
  hasMarkup,
  onPress,
  onLongPress,
  onMore,
}: IssueCardProps) {
  const first = assets[0];
  // Prefer the flattened annotated copy so the hit list shows the markup.
  const thumb = first ? (first.annotatedUri ?? first.thumbUri) : undefined;
  const showMarkupBadge = hasMarkup || !!first?.annotatedUri;
  const spineColor = STATUS_COLORS[issue.status].color;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={[styles.card, !issue.includeInReport && styles.excluded]}
      testID={`issue-card-${issue.id}`}
    >
      <View style={[styles.spine, { backgroundColor: spineColor }]} />
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
        {showMarkupBadge ? (
          <View style={styles.markupBadge}>
            <PenLine color={palette.white} size={9} />
            <Text style={styles.markupBadgeText}>Marked up</Text>
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
      {onMore ? (
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={onMore}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID={`issue-card-more-${issue.id}`}
          accessibilityLabel="Quick actions"
        >
          <MoreVertical color={palette.textFaint} size={18} />
        </TouchableOpacity>
      ) : null}
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
    paddingLeft: spacing.sm + 6,
    marginBottom: spacing.sm,
    gap: spacing.md,
    overflow: "hidden",
  },
  spine: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  excluded: { opacity: 0.55 },
  thumbWrap: { position: "relative" },
  thumb: { width: 86, height: 86, borderRadius: radius.md },
  thumbPlaceholder: {
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  photoCount: {
    position: "absolute",
    right: 4,
    top: 4,
    backgroundColor: "rgba(22,26,29,0.85)",
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  photoCountText: { color: palette.white, fontSize: 10, fontFamily: font.family.bodyBold },
  markupBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: palette.green,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
  },
  markupBadgeText: { color: palette.white, fontSize: 8, fontFamily: font.family.bodyBold, textTransform: "uppercase", letterSpacing: 0.3 },
  body: { flex: 1, paddingVertical: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  number: {
    fontSize: font.size.xs,
    fontFamily: font.family.headingHeavy,
    color: palette.textFaint,
    letterSpacing: 0.5,
  },
  title: { fontSize: font.size.md, fontFamily: font.family.heading, color: palette.text, marginTop: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  metaText: { fontSize: font.size.xs, color: palette.textMuted, marginRight: 8, maxWidth: 110 },
  pillRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  moreBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
