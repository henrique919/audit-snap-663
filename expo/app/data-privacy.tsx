/** Data & privacy — full-text disclosures linked from Settings and Home. */

import { Info } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, SectionTitle } from "@/components/ui";
import { font, palette, radius, spacing } from "@/constants/theme";
import {
  BLUR_REDACTION,
  CAMERA_PHOTOS,
  EXPORT_SHARING,
  LOCAL_STORAGE_WARNING,
  PRODUCT_SCOPE,
  PROVISIONAL_NOTICE,
  REPORT_FOOTER_NOTE,
  RETENTION_DELETION,
} from "@/lib/legalCopy";

export default function DataPrivacyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.notice} testID="provisional-notice">
        <Info color={palette.amberText} size={16} />
        <Text style={styles.noticeText}>{PROVISIONAL_NOTICE}</Text>
      </View>

      <SectionTitle title="Product scope" />
      <Card>
        <Text style={styles.body}>{PRODUCT_SCOPE}</Text>
      </Card>

      <SectionTitle title="Local storage" />
      <Card>
        <Text style={styles.body}>{LOCAL_STORAGE_WARNING}</Text>
      </Card>

      <SectionTitle title="Camera & photos" />
      <Card>
        <Text style={styles.body}>{CAMERA_PHOTOS}</Text>
      </Card>

      <SectionTitle title="Blur & redaction" />
      <Card>
        <Text style={styles.body}>{BLUR_REDACTION}</Text>
      </Card>

      <SectionTitle title="Retention & deletion" />
      <Card>
        <Text style={styles.body}>{RETENTION_DELETION}</Text>
      </Card>

      <SectionTitle title="Exporting & sharing" />
      <Card>
        <Text style={styles.body}>{EXPORT_SHARING}</Text>
      </Card>

      <SectionTitle title="Report footer" />
      <Card>
        <Text style={styles.body}>{REPORT_FOOTER_NOTE}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: palette.amberSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.amber,
    padding: spacing.md,
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontSize: font.size.xs,
    fontFamily: font.family.bodySemibold,
    color: palette.amberText,
    lineHeight: 17,
  },
  body: {
    fontSize: font.size.sm,
    fontFamily: font.family.body,
    color: palette.text,
    lineHeight: 20,
  },
});
