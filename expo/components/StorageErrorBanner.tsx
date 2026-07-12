/** Dismissable app-wide banner for local persistence failures. */

import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { font, palette, radius, shadow, spacing } from "@/constants/theme";
import { useAppStore } from "@/providers/AppStore";

export function StorageErrorBanner() {
  const { persistStatus, lastPersistError, persistFailureVersion } = useAppStore();
  const [dismissedFailureVersion, setDismissedFailureVersion] = useState<number | null>(null);

  useEffect(() => {
    // A successful save clears persistStatus; a new failure gets a new message.
    if (persistStatus !== "error") {
      setDismissedFailureVersion(null);
    }
  }, [persistStatus]);

  const visible = useMemo(() => {
    if (persistStatus !== "error" || !lastPersistError) return false;
    return dismissedFailureVersion !== persistFailureVersion;
  }, [dismissedFailureVersion, lastPersistError, persistFailureVersion, persistStatus]);

  if (!visible || !lastPersistError) return null;

  const storageFull =
    /quota|full|space|ENOSPC|disk/i.test(lastPersistError) ||
    lastPersistError.toLowerCase().includes("storage full");

  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="storage-error-banner" accessibilityRole="alert">
      <View style={styles.banner}>
        <View style={styles.messageWrap}>
          <Text style={styles.title}>{"Couldn't save your latest changes — retrying"}</Text>
          <Text style={styles.sub}>
            {storageFull
              ? "Storage full? Free up space and keep the app open."
              : lastPersistError}
          </Text>
        </View>
        <Pressable
          testID="storage-error-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Dismiss storage error"
          onPress={() => setDismissedFailureVersion(persistFailureVersion)}
          style={styles.dismiss}
        >
          <Text style={styles.dismissLabel}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 50,
  },
  banner: {
    backgroundColor: palette.redSoft,
    borderColor: palette.red,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadow.card,
  },
  messageWrap: { flex: 1, gap: 2 },
  title: {
    color: palette.red,
    fontFamily: font.family.bodyBold,
    fontSize: font.size.sm,
  },
  sub: {
    color: palette.textMuted,
    fontFamily: font.family.bodyMedium,
    fontSize: font.size.xs,
  },
  dismiss: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  dismissLabel: {
    color: palette.carbon,
    fontFamily: font.family.bodySemibold,
    fontSize: font.size.xs,
  },
});
