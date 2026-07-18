/**
 * Web action-sheet host for lib/dialogs.ts `showActions()`. Native ignores
 * this — showActions delegates straight to the OS Alert there. Mounted once
 * in app/_layout.tsx so any handler in the tree can trigger it via the
 * dialogs module without prop drilling.
 */

import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { font, palette, radius, shadow, spacing } from "@/constants/theme";
import { __registerActionSheetListener, ActionSheetRequest, DialogAction } from "@/lib/dialogs";

export function ActionSheetHost() {
  const [request, setRequest] = useState<ActionSheetRequest | null>(null);

  useEffect(() => {
    __registerActionSheetListener(setRequest);
    return () => __registerActionSheetListener(null);
  }, []);

  const close = () => setRequest(null);

  const handlePress = (action: DialogAction) => {
    close();
    void action.onPress?.();
  };

  if (!request) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} testID="action-sheet-modal">
      {/* Backdrop is a presentational tap-to-dismiss layer, NOT a button — a
          button role here renders as <button> on web and would nest the action
          <button>s inside it (invalid HTML + confuses screen readers). Dismissal
          stays available via the action rows and Escape (onRequestClose). */}
      <Pressable
        style={styles.backdrop}
        onPress={close}
        testID="action-sheet-backdrop"
        importantForAccessibility="no"
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header} accessibilityRole="header">
            <Text style={styles.title} testID="action-sheet-title">
              {request.title}
            </Text>
            {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          </View>
          {request.actions.map((action, i) => (
            <TouchableOpacity
              key={`${action.text}-${i}`}
              style={[styles.actionRow, i === request.actions.length - 1 && styles.actionRowLast]}
              onPress={() => handlePress(action)}
              testID={`action-sheet-btn-${i}`}
              accessibilityRole="button"
              accessibilityLabel={action.style === "destructive" ? `${action.text}, destructive action` : action.text}
            >
              <Text
                style={[
                  styles.actionText,
                  action.style === "destructive" && styles.actionTextDestructive,
                  action.style === "cancel" && styles.actionTextCancel,
                ]}
              >
                {action.text}
              </Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(22,26,29,0.55)",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.lg,
    ...shadow.floating,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    gap: 4,
  },
  title: {
    fontSize: font.size.md,
    fontFamily: font.family.bodyBold,
    color: palette.text,
    textAlign: "center",
  },
  message: {
    fontSize: font.size.sm,
    color: palette.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  actionRow: {
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    alignItems: "center",
  },
  actionRowLast: { borderBottomWidth: 0 },
  actionText: {
    fontSize: font.size.md,
    fontFamily: font.family.bodySemibold,
    color: palette.carbon,
  },
  actionTextDestructive: { color: palette.red },
  actionTextCancel: { color: palette.textMuted, fontFamily: font.family.bodyBold },
});
