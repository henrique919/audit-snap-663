/** Small shared UI primitives — buttons, fields, chips, sections. */

import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";

import { font, palette, radius, shadow, spacing } from "@/constants/theme";

function tap() {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  style?: ViewStyle;
  testID?: string;
}

export function AppButton({ label, onPress, icon, disabled, loading, variant = "primary", style, testID }: ButtonProps) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        styles.btn,
        isPrimary && styles.btnPrimary,
        variant === "secondary" && styles.btnSecondary,
        isGhost && styles.btnGhost,
        isDanger && styles.btnDanger,
        (disabled || loading) && styles.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={isPrimary || isDanger ? palette.white : palette.carbon}
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.btnLabel,
              (variant === "secondary" || isGhost) && styles.btnLabelDark,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  optional?: boolean;
  multiline?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

export function Field({ label, value, onChangeText, placeholder, optional, multiline, autoFocus, testID }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.fieldOptional}>  optional</Text> : null}
      </Text>
      <TextInput
        testID={testID}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textFaint}
        multiline={multiline}
        autoFocus={autoFocus}
      />
    </View>
  );
}

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  small?: boolean;
  testID?: string;
}

export function Chip({ label, active, onPress, icon, small, testID }: ChipProps) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.75}
      disabled={!onPress}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}
    >
      {icon}
      <Text style={[styles.chipLabel, small && styles.chipLabelSmall, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function EmptyState({ icon, title, message }: { icon?: React.ReactNode; title: string; message: string }) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  sub?: string;
  testID?: string;
}

export function ToggleRow({ label, value, onToggle, sub, testID }: ToggleRowProps) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.7}
      onPress={() => {
        tap();
        onToggle(!value);
      }}
      style={styles.toggleRow}
    >
      <View style={styles.toggleTextWrap}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sub ? <Text style={styles.toggleSub}>{sub}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </TouchableOpacity>
  );
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.8}
            onPress={() => {
              tap();
              onChange(opt.value);
            }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  btnPrimary: { backgroundColor: palette.cobalt },
  btnSecondary: {
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
  },
  btnGhost: { backgroundColor: "transparent" },
  btnDanger: { backgroundColor: palette.red },
  btnDisabled: { opacity: 0.5 },
  btnLabel: { color: palette.white, fontSize: font.size.md, fontFamily: font.family.bodyBold },
  btnLabelDark: { color: palette.carbon },

  field: { marginBottom: spacing.lg },
  fieldLabel: {
    fontSize: font.size.xs,
    fontFamily: font.family.bodyBold,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  fieldOptional: { color: palette.textFaint, fontFamily: font.family.bodyMedium, textTransform: "none" },
  input: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: font.size.md,
    fontFamily: font.family.body,
    color: palette.text,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: "top" },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: palette.border,
    maxWidth: 220,
  },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: palette.cobalt, borderColor: palette.cobalt },
  chipLabel: { fontSize: font.size.sm, fontFamily: font.family.bodySemibold, color: palette.text },
  chipLabelSmall: { fontSize: font.size.xs },
  chipLabelActive: { color: palette.white },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: font.size.sm,
    fontFamily: font.family.bodyHeavy,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },

  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: font.size.lg, fontFamily: font.family.bodyBold, color: palette.text, marginTop: 8 },
  emptyMessage: { fontSize: font.size.sm, color: palette.textMuted, textAlign: "center", lineHeight: 20 },

  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    ...shadow.card,
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    gap: spacing.md,
  },
  toggleTextWrap: { flex: 1 },
  toggleLabel: { fontSize: font.size.md, fontFamily: font.family.bodySemibold, color: palette.text },
  toggleSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 2 },
  toggleTrack: {
    width: 48,
    height: 29,
    borderRadius: radius.pill,
    backgroundColor: palette.borderStrong,
    padding: 3,
    justifyContent: "center",
  },
  toggleTrackOn: { backgroundColor: palette.cobalt },
  toggleThumb: {
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: palette.white,
  },
  toggleThumbOn: { alignSelf: "flex-end" },

  segmented: {
    flexDirection: "row",
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  segmentActive: { backgroundColor: palette.cobalt },
  segmentLabel: { fontSize: font.size.xs, fontFamily: font.family.bodyBold, color: palette.textMuted },
  segmentLabelActive: { color: palette.white },
});
