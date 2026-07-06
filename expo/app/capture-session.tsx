/** Capture Mode — the heart of the app. Photo → fast issue sheet → repeat. */

import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Camera,
  Check,
  CloudOff,
  Images,
  MapPin,
  Mic,
  PenLine,
  UserRound,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Chip, Segmented, ToggleRow } from "@/components/ui";
import { font, palette, radius, shadow, spacing } from "@/constants/theme";
import { newId } from "@/lib/ids";
import { ProcessedPhoto, processPickedPhoto } from "@/lib/files";
import { useAppStore, useAudit, useIssuesForAudit, useProject } from "@/providers/AppStore";
import type { IssuePriority, IssueStatus } from "@/types/models";

interface DraftIssue {
  photos: ProcessedPhoto[];
  title: string;
  description: string;
  location: string;
  assignee: string;
  priority: IssuePriority;
  status: IssueStatus;
  includeInReport: boolean;
}

export default function CaptureSession() {
  const { auditId } = useLocalSearchParams<{ auditId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { db, settings, createIssue, findOrCreateLocation, findOrCreateAssignee } = useAppStore();
  const audit = useAudit(auditId);
  const project = useProject(audit?.projectId);
  const issues = useIssuesForAudit(auditId);

  const [processing, setProcessing] = useState<boolean>(false);
  const [draft, setDraft] = useState<DraftIssue | null>(null);

  const lastLocationName = useMemo(() => {
    const id = settings.lastLocationId ?? audit?.defaultLocationId ?? null;
    return db.locations.find((l) => l.id === id)?.name ?? "";
  }, [db.locations, settings.lastLocationId, audit?.defaultLocationId]);

  const lastAssigneeName = useMemo(() => {
    const id = settings.lastAssigneeId ?? audit?.defaultAssigneeId ?? null;
    return db.assignees.find((a) => a.id === id)?.name ?? "";
  }, [db.assignees, settings.lastAssigneeId, audit?.defaultAssigneeId]);

  const projectLocations = useMemo(
    () => db.locations.filter((l) => l.projectId === audit?.projectId && !l.deletedAt),
    [db.locations, audit?.projectId],
  );
  const knownAssignees = useMemo(() => db.assignees.filter((a) => !a.deletedAt), [db.assignees]);

  const openDraft = useCallback(
    (photos: ProcessedPhoto[]) => {
      setDraft({
        photos,
        title: "",
        description: "",
        location: lastLocationName,
        assignee: lastAssigneeName,
        priority: settings.lastPriority,
        status: "open",
        includeInReport: true,
      });
    },
    [lastLocationName, lastAssigneeName, settings.lastPriority],
  );

  const takePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera unavailable", "Camera permission is required. You can also add photos from the gallery.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      const uri = result.assets?.[0]?.uri;
      if (result.canceled || !uri) return;
      setProcessing(true);
      const processed = await processPickedPhoto(uri, newId());
      openDraft([processed]);
    } catch (e) {
      console.log("[capture] camera failed", e);
      Alert.alert("Camera unavailable", "Could not open the camera on this device. Try the gallery instead.");
    } finally {
      setProcessing(false);
    }
  }, [openDraft]);

  const pickFromGallery = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsMultipleSelection: true,
        selectionLimit: 6,
      });
      if (result.canceled || result.assets.length === 0) return;
      setProcessing(true);
      const processed: ProcessedPhoto[] = [];
      for (const asset of result.assets) {
        processed.push(await processPickedPhoto(asset.uri, newId()));
      }
      openDraft(processed);
    } catch (e) {
      console.log("[capture] gallery failed", e);
    } finally {
      setProcessing(false);
    }
  }, [openDraft]);

  const saveDraft = useCallback(
    (next: "photo" | "review" | "markup") => {
      if (!draft || !audit) return null;
      const locationId = draft.location.trim()
        ? findOrCreateLocation(audit.projectId, draft.location).id
        : null;
      const assigneeId = draft.assignee.trim() ? findOrCreateAssignee(draft.assignee).id : null;
      const issue = createIssue(
        {
          auditId: audit.id,
          projectId: audit.projectId,
          locationId,
          title: draft.title.trim() || `Issue at ${draft.location.trim() || "site"}`,
          description: draft.description.trim(),
          status: draft.status,
          priority: draft.priority,
          assigneeId,
          includeInReport: draft.includeInReport,
        },
        draft.photos,
      );
      setDraft(null);
      if (next === "photo") {
        takePhoto();
      } else if (next === "review") {
        router.replace({ pathname: "/audit/[id]/hitlist", params: { id: audit.id } });
      }
      return issue;
    },
    [draft, audit, createIssue, findOrCreateLocation, findOrCreateAssignee, router, takePhoto],
  );

  if (!audit || !project) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Audit not found.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} testID="capture-close">
            <X color={palette.white} size={20} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {audit.title}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {project.name}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.headerBtn, styles.doneBtn]}
            onPress={() => router.replace({ pathname: "/audit/[id]/hitlist", params: { id: audit.id } })}
            testID="capture-done"
          >
            <Check color={palette.white} size={20} />
          </TouchableOpacity>
        </View>

        {/* Status chips */}
        <View style={styles.chipRow}>
          <View style={styles.countChip}>
            <Text style={styles.countNum}>{issues.length}</Text>
            <Text style={styles.countLbl}>issues</Text>
          </View>
          {lastLocationName ? (
            <View style={styles.metaChip}>
              <MapPin color={palette.white} size={12} />
              <Text style={styles.metaChipText} numberOfLines={1}>
                {lastLocationName}
              </Text>
            </View>
          ) : null}
          {lastAssigneeName ? (
            <View style={styles.metaChip}>
              <UserRound color={palette.white} size={12} />
              <Text style={styles.metaChipText} numberOfLines={1}>
                {lastAssigneeName}
              </Text>
            </View>
          ) : null}
          <View style={styles.offlineChip}>
            <CloudOff color={palette.greenBright} size={12} />
            <Text style={styles.offlineText}>Saved locally</Text>
          </View>
        </View>

        {/* Recent strip */}
        <ScrollView style={styles.recentWrap} contentContainerStyle={styles.recentContent} horizontal showsHorizontalScrollIndicator={false}>
          {issues
            .slice()
            .reverse()
            .slice(0, 12)
            .map((issue) => {
              const thumb = db.assets.find((a) => a.issueId === issue.id && !a.deletedAt)?.thumbUri;
              return (
                <TouchableOpacity
                  key={issue.id}
                  onPress={() => router.push({ pathname: "/issue/[id]", params: { id: issue.id } })}
                  style={styles.recentItem}
                >
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.recentImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.recentImg, styles.recentPlaceholder]}>
                      <Camera color={palette.textFaint} size={16} />
                    </View>
                  )}
                  <Text style={styles.recentNum}>#{issue.issueNumber}</Text>
                </TouchableOpacity>
              );
            })}
        </ScrollView>

        {/* Capture controls */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.xl }]}>
          <TouchableOpacity style={styles.sideBtn} onPress={pickFromGallery} testID="capture-gallery">
            <Images color={palette.white} size={24} />
            <Text style={styles.sideLbl}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shutter} onPress={takePhoto} disabled={processing} testID="capture-shutter">
            {processing ? (
              <ActivityIndicator color={palette.navy} size="large" />
            ) : (
              <Camera color={palette.navy} size={34} strokeWidth={2.2} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => Alert.alert("Voice notes", "Voice-to-issue capture is coming in a future update.")}
          >
            <Mic color={palette.textFaint} size={24} />
            <Text style={[styles.sideLbl, styles.sideLblMuted]}>Voice</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Fast issue sheet */}
      <Modal visible={draft !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDraft(null)}>
        {draft ? (
          <KeyboardAvoidingView style={styles.sheetFlex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>New Issue</Text>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert("Discard photo?", "This photo and issue will not be saved.", [
                      { text: "Keep editing", style: "cancel" },
                      { text: "Discard", style: "destructive", onPress: () => setDraft(null) },
                    ])
                  }
                >
                  <X color={palette.textMuted} size={22} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
                <View style={styles.previewRow}>
                  {draft.photos.map((p, i) => (
                    <Image key={i} source={{ uri: p.thumbUri }} style={styles.preview} contentFit="cover" />
                  ))}
                </View>
                <AppButton
                  label="Save & Mark Up Photo"
                  variant="secondary"
                  icon={<PenLine color={palette.navy} size={18} />}
                  onPress={() => {
                    const issue = saveDraft("markup");
                    if (issue) {
                      const asset = db.assets.find((a) => a.issueId === issue.id);
                      setTimeout(() => {
                        const created = asset ?? null;
                        if (created) {
                          router.push({ pathname: "/markup/[assetId]", params: { assetId: created.id } });
                        } else {
                          router.push({ pathname: "/issue/[id]", params: { id: issue.id } });
                        }
                      }, 50);
                    }
                  }}
                  style={styles.markupBtn}
                />

                <TextInput
                  style={styles.titleInput}
                  value={draft.title}
                  onChangeText={(v) => setDraft({ ...draft, title: v })}
                  placeholder="Issue title (e.g. Paint scuffing to wall)"
                  placeholderTextColor={palette.textFaint}
                  testID="issue-title-input"
                />
                <TextInput
                  style={styles.descInput}
                  value={draft.description}
                  onChangeText={(v) => setDraft({ ...draft, description: v })}
                  placeholder="Notes / description (optional)"
                  placeholderTextColor={palette.textFaint}
                  multiline
                />

                <Text style={styles.fieldLbl}>Location</Text>
                <TextInput
                  style={styles.smallInput}
                  value={draft.location}
                  onChangeText={(v) => setDraft({ ...draft, location: v })}
                  placeholder="e.g. Level 1 Corridor"
                  placeholderTextColor={palette.textFaint}
                />
                {projectLocations.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
                    {projectLocations.map((l) => (
                      <Chip key={l.id} label={l.name} small active={draft.location === l.name} onPress={() => setDraft({ ...draft, location: l.name })} />
                    ))}
                  </ScrollView>
                ) : null}

                <Text style={styles.fieldLbl}>Assignee</Text>
                <TextInput
                  style={styles.smallInput}
                  value={draft.assignee}
                  onChangeText={(v) => setDraft({ ...draft, assignee: v })}
                  placeholder="Who fixes this (optional)"
                  placeholderTextColor={palette.textFaint}
                />
                {knownAssignees.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
                    {knownAssignees.map((a) => (
                      <Chip key={a.id} label={a.name} small active={draft.assignee === a.name} onPress={() => setDraft({ ...draft, assignee: a.name })} />
                    ))}
                  </ScrollView>
                ) : null}

                <Text style={styles.fieldLbl}>Priority</Text>
                <Segmented
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                  value={draft.priority}
                  onChange={(v) => setDraft({ ...draft, priority: v })}
                />

                <Text style={styles.fieldLbl}>Status</Text>
                <Segmented
                  options={[
                    { value: "open", label: "Open" },
                    { value: "assigned", label: "Assigned" },
                    { value: "in_progress", label: "In Prog." },
                    { value: "completed", label: "Done" },
                  ]}
                  value={draft.status}
                  onChange={(v) => setDraft({ ...draft, status: v })}
                />

                <ToggleRow
                  label="Include in report"
                  value={draft.includeInReport}
                  onToggle={(v) => setDraft({ ...draft, includeInReport: v })}
                />
              </ScrollView>
              <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
                <AppButton label="Save & Review" variant="secondary" onPress={() => saveDraft("review")} style={styles.footerBtn} />
                <AppButton testID="save-next-photo" label="Save & Next Photo" onPress={() => saveDraft("photo")} style={styles.footerBtnWide} />
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : (
          <View />
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.navyDeep, paddingHorizontal: spacing.lg },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtn: { backgroundColor: palette.green },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: palette.white, fontSize: font.size.md, fontWeight: font.weight.bold },
  headerSub: { color: "rgba(255,255,255,0.55)", fontSize: font.size.xs, marginTop: 1 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  countChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countNum: { color: palette.white, fontSize: font.size.lg, fontWeight: font.weight.heavy },
  countLbl: { color: "rgba(255,255,255,0.6)", fontSize: font.size.xs, fontWeight: font.weight.bold },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 150,
  },
  metaChipText: { color: palette.white, fontSize: font.size.xs, fontWeight: font.weight.semibold },
  offlineChip: { flexDirection: "row", alignItems: "center", gap: 5 },
  offlineText: { color: palette.greenBright, fontSize: font.size.xs, fontWeight: font.weight.bold },
  recentWrap: { flexGrow: 0, marginTop: spacing.xl },
  recentContent: { gap: spacing.sm },
  recentItem: { alignItems: "center", gap: 3 },
  recentImg: { width: 64, height: 64, borderRadius: radius.md },
  recentPlaceholder: { backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  recentNum: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: font.weight.bold },
  controls: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 5,
    borderColor: "rgba(255,255,255,0.35)",
    ...shadow.floating,
  },
  sideBtn: { alignItems: "center", gap: 5, paddingBottom: spacing.lg, minWidth: 70 },
  sideLbl: { color: palette.white, fontSize: font.size.xs, fontWeight: font.weight.bold },
  sideLblMuted: { color: palette.textFaint },

  sheetFlex: { flex: 1 },
  sheet: { flex: 1, backgroundColor: palette.background },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetTitle: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: palette.text },
  sheetContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  previewRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  preview: { width: 84, height: 84, borderRadius: radius.md },
  markupBtn: { marginBottom: spacing.md },
  titleInput: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    color: palette.text,
    marginBottom: spacing.sm,
  },
  descInput: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: font.size.md,
    color: palette.text,
    minHeight: 64,
    textAlignVertical: "top",
  },
  fieldLbl: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: 6,
  },
  smallInput: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: font.size.md,
    color: palette.text,
  },
  suggestRow: { gap: 6, paddingTop: 8 },
  sheetFooter: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: palette.background,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  footerBtn: { flex: 1 },
  footerBtnWide: { flex: 1.4 },
});
