/** Start Audit — quick setup, then straight into capture. */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Camera } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppButton, Chip, Field } from "@/components/ui";
import { REPORT_THEMES, ReportThemeKey, resolveThemeKey } from "@/constants/config";
import { font, palette, spacing } from "@/constants/theme";
import { todayIsoDate } from "@/lib/format";
import { useAppStore, useProject } from "@/providers/AppStore";

export default function AuditNewScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const { createAudit, findOrCreateLocation, findOrCreateAssignee, settings, db } = useAppStore();
  const project = useProject(projectId);

  const [title, setTitle] = useState<string>("Site Walk — " + new Date().toLocaleDateString());
  const [auditDate, setAuditDate] = useState<string>(todayIsoDate());
  const [preparedFor, setPreparedFor] = useState<string>(project?.clientName ?? "");
  const [preparedBy, setPreparedBy] = useState<string>(project?.inspectorName || settings.inspectorName);
  const [defaultLocation, setDefaultLocation] = useState<string>("");
  const [defaultAssignee, setDefaultAssignee] = useState<string>("");
  const [themeKey, setThemeKey] = useState<ReportThemeKey>(
    resolveThemeKey(settings.defaultReportOptions.themeKey),
  );

  const existingLocations = useMemo(
    () => db.locations.filter((l) => l.projectId === projectId && !l.deletedAt).slice(0, 6),
    [db.locations, projectId],
  );

  if (!project) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Project not found.</Text>
      </View>
    );
  }

  const start = () => {
    if (!title.trim()) {
      Alert.alert("Audit title required", "Give the audit a title for the report cover.");
      return;
    }
    const locationId = defaultLocation.trim()
      ? findOrCreateLocation(project.id, defaultLocation).id
      : null;
    const assigneeId = defaultAssignee.trim() ? findOrCreateAssignee(defaultAssignee).id : null;
    const audit = createAudit({
      projectId: project.id,
      title: title.trim(),
      auditDate,
      preparedFor: preparedFor.trim(),
      preparedBy: preparedBy.trim(),
      defaultLocationId: locationId,
      defaultAssigneeId: assigneeId,
      themeKey,
    });
    router.replace({ pathname: "/capture-session", params: { auditId: audit.id } });
  };

  return (
    <>
      <Stack.Screen options={{ title: `New Audit · ${project.name}` }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="Audit title" value={title} onChangeText={setTitle} placeholder="e.g. Pre-Handover Site Walk" testID="audit-title" />
          <Field label="Audit date" value={auditDate} onChangeText={setAuditDate} placeholder="YYYY-MM-DD" />
          <Field label="Prepared for" value={preparedFor} onChangeText={setPreparedFor} placeholder="Client / recipient" optional />
          <Field label="Prepared by / inspector" value={preparedBy} onChangeText={setPreparedBy} placeholder="Inspector name" optional />
          <Field label="Default location" value={defaultLocation} onChangeText={setDefaultLocation} placeholder="e.g. Lobby" optional />
          {existingLocations.length > 0 ? (
            <View style={styles.chipsWrap}>
              {existingLocations.map((l) => (
                <Chip key={l.id} label={l.name} small active={defaultLocation === l.name} onPress={() => setDefaultLocation(l.name)} />
              ))}
            </View>
          ) : null}
          <Field label="Default assignee" value={defaultAssignee} onChangeText={setDefaultAssignee} placeholder="e.g. BuildRight Painting" optional />

          <Text style={styles.themeLabel}>Report theme</Text>
          <View style={styles.chipsWrap}>
            {(Object.keys(REPORT_THEMES) as ReportThemeKey[]).map((key) => (
              <Chip
                key={key}
                label={REPORT_THEMES[key].label}
                active={themeKey === key}
                onPress={() => setThemeKey(key)}
              />
            ))}
          </View>

          <AppButton
            testID="start-capture"
            label="Start Capture"
            icon={<Camera color={palette.white} size={18} />}
            onPress={start}
            style={styles.startBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 60 },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.lg, marginTop: -6 },
  themeLabel: {
    fontSize: font.size.xs,
    fontFamily: font.family.bodyBold,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  startBtn: { marginTop: spacing.md },
});
