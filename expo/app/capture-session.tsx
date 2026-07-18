/** Capture Mode — the heart of the app. Photo → fast issue sheet → repeat. */

import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Camera,
  Check,
  CloudOff,
  Images,
  MapPin,
  PenLine,
  UserRound,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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
import { showAlert, showConfirm } from "@/lib/dialogs";
import { issueRef } from "@/lib/format";
import { newId } from "@/lib/ids";
import { ProcessedPhoto, deleteProcessedPhoto, processPickedPhoto } from "@/lib/files";
import { processPhotosBounded } from "@/lib/processPhotos";
import { savedToastMessage } from "@/lib/saveState";
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
  const { db, settings, createIssue, findOrCreateLocation, findOrCreateAssignee, persistStatus } = useAppStore();
  const audit = useAudit(auditId);
  const project = useProject(audit?.projectId);
  const issues = useIssuesForAudit(auditId);

  const [processing, setProcessing] = useState<boolean>(false);
  const [galleryProgress, setGalleryProgress] = useState<{ done: number; total: number } | null>(null);
  const [draft, setDraft] = useState<DraftIssue | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  /** Explicit local-save confirmation — the user should never wonder if it saved. */
  const showSavedToast = useCallback(
    (message: string) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setToast(message);
      AccessibilityInfo.announceForAccessibility(message);
      toastOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(toastOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.delay(1900),
        Animated.timing(toastOpacity, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start(() => setToast(null));
    },
    [toastOpacity],
  );

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

  /** Discard an unsaved draft and delete its processed photo variants (never touches saved issues). */
  const discardDraft = useCallback(async (current: DraftIssue | null) => {
    if (current) {
      for (const photo of current.photos) {
        await deleteProcessedPhoto(photo);
      }
    }
    setDraft(null);
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showAlert("Camera unavailable", "Camera permission is required. You can also add photos from the gallery.");
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
      showAlert("Camera unavailable", "Could not open the camera on this device. Try the gallery instead.");
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
      setGalleryProgress({ done: 0, total: result.assets.length });
      const processed = await processPhotosBounded(
        result.assets.map((a) => a.uri),
        { concurrency: 2, onProgress: (done, total) => setGalleryProgress({ done, total }) },
      );
      openDraft(processed);
    } catch (e) {
      console.log("[capture] gallery failed", e);
      // Batch processing is atomic — one unreadable file discards the whole
      // pick, so the user must be told rather than left staring at a spinner
      // that vanished with no result.
      showAlert(
        "Couldn't add photos",
        "One of the selected images could not be read. No photos were added — try selecting them again.",
      );
    } finally {
      setProcessing(false);
      setGalleryProgress(null);
    }
  }, [openDraft]);

  const saveDraft = useCallback(
    (next: "photo" | "review" | "markup") => {
      if (!draft || !audit) return null;
      const locationId = draft.location.trim()
        ? findOrCreateLocation(audit.projectId, draft.location).id
        : null;
      const assigneeId = draft.assignee.trim() ? findOrCreateAssignee(draft.assignee).id : null;
      const saved = createIssue(
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
      showSavedToast(savedToastMessage(issueRef(saved.issue.issueNumber), persistStatus));
      if (next === "photo") {
        takePhoto();
      } else if (next === "review") {
        router.replace({ pathname: "/audit/[id]/hitlist", params: { id: audit.id } });
      }
      return saved;
    },
    [draft, audit, createIssue, findOrCreateLocation, findOrCreateAssignee, router, takePhoto, showSavedToast, persistStatus],
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
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.back()}
            testID="capture-close"
            accessibilityRole="button"
            accessibilityLabel="Close capture session"
          >
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
            style={styles.doneBtn}
            onPress={() => router.replace({ pathname: "/audit/[id]/hitlist", params: { id: audit.id } })}
            testID="capture-done"
            accessibilityRole="button"
            accessibilityLabel="Done, review hit list"
          >
            <Check color={palette.white} size={16} strokeWidth={2.8} />
            <Text style={styles.doneText}>Done</Text>
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
        {issues.length > 0 ? <Text style={styles.recentLabel}>Recent captures</Text> : null}
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
                  accessibilityRole="button"
                  accessibilityLabel={`Open issue ${issueRef(issue.issueNumber)}`}
                >
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.recentImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.recentImg, styles.recentPlaceholder]}>
                      <Camera color={palette.textFaintOnDark} size={16} />
                    </View>
                  )}
                  <Text style={styles.recentNum}>#{issue.issueNumber}</Text>
                </TouchableOpacity>
              );
            })}
        </ScrollView>

        {/* Saved toast */}
        {toast ? (
          <Animated.View style={[styles.toast, { opacity: toastOpacity, pointerEvents: "none" }]}>
            <Check color={palette.greenBright} size={15} strokeWidth={3} />
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        ) : null}

        {/* Gallery multi-select processing feedback */}
        {galleryProgress ? (
          <View style={[styles.toast, { pointerEvents: "none" }]} testID="gallery-progress">
            <ActivityIndicator color={palette.greenBright} size="small" />
            <Text style={styles.toastText}>
              Processing {galleryProgress.done}/{galleryProgress.total}…
            </Text>
          </View>
        ) : null}

        {/* Capture controls */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.xl }]}>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={pickFromGallery}
            disabled={processing}
            testID="capture-gallery"
            accessibilityRole="button"
            accessibilityLabel="Add photos from gallery"
            accessibilityState={{ disabled: processing, busy: processing }}
          >
            <View style={styles.sideChip}>
              <Images color={palette.white} size={22} />
            </View>
            <Text style={styles.sideLbl}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shutterRing}
            onPress={takePhoto}
            disabled={processing}
            testID="capture-shutter"
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ disabled: processing, busy: processing }}
          >
            <View style={styles.shutter}>
              {processing ? (
                <ActivityIndicator color={palette.carbon} size="large" />
              ) : (
                <Camera color={palette.carbon} size={34} strokeWidth={2.2} />
              )}
            </View>
          </TouchableOpacity>
          {/* Spacer balances Gallery column width at 390×844 (Voice control removed). */}
          <View style={styles.sideBtn} pointerEvents="none" accessibilityElementsHidden />
        </View>
      </View>

      {/* Fast issue sheet */}
      <Modal
        visible={draft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          void discardDraft(draft);
        }}
      >
        {draft ? (
          <KeyboardAvoidingView style={styles.sheetFlex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>New Issue</Text>
                <TouchableOpacity
                  onPress={async () => {
                    const ok = await showConfirm(
                      "Discard photo?",
                      "This photo and issue will not be saved.",
                      "Discard",
                      true,
                      "Keep editing",
                    );
                    if (ok) void discardDraft(draft);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Discard photo and close"
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
                  label="Save Issue & Mark Up Photo"
                  variant="secondary"
                  icon={<PenLine color={palette.carbon} size={18} />}
                  onPress={() => {
                    const saved = saveDraft("markup");
                    if (saved) {
                      const asset = saved.assets[0];
                      if (asset) {
                        router.push({ pathname: "/markup/[assetId]", params: { assetId: asset.id } });
                      } else {
                        router.push({ pathname: "/issue/[id]", params: { id: saved.issue.id } });
                      }
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
                  accessibilityLabel="Issue title"
                />
                <TextInput
                  style={styles.descInput}
                  value={draft.description}
                  onChangeText={(v) => setDraft({ ...draft, description: v })}
                  placeholder="Notes / description (optional)"
                  placeholderTextColor={palette.textFaint}
                  multiline
                  accessibilityLabel="Notes or description, optional"
                />

                <Text style={styles.fieldLbl}>Location</Text>
                <TextInput
                  style={styles.smallInput}
                  value={draft.location}
                  onChangeText={(v) => setDraft({ ...draft, location: v })}
                  placeholder="e.g. Level 1 Corridor"
                  placeholderTextColor={palette.textFaint}
                  accessibilityLabel="Location"
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
                  accessibilityLabel="Assignee, optional"
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
  container: { flex: 1, backgroundColor: palette.carbonDeep, paddingHorizontal: spacing.lg },
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
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    // cobaltDeep, not cobalt — the label is white (see theme.ts).
    backgroundColor: palette.cobaltDeep,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 40,
  },
  doneText: { color: palette.white, fontSize: font.size.sm, fontFamily: font.family.bodyBold },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: palette.white, fontSize: font.size.md, fontFamily: font.family.heading },
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
  countNum: { color: palette.white, fontSize: font.size.lg, fontFamily: font.family.headingHeavy },
  countLbl: { color: "rgba(255,255,255,0.6)", fontSize: font.size.xs, fontFamily: font.family.bodyBold },
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
  metaChipText: { color: palette.white, fontSize: font.size.xs, fontFamily: font.family.bodySemibold },
  offlineChip: { flexDirection: "row", alignItems: "center", gap: 5 },
  offlineText: { color: palette.greenBright, fontSize: font.size.xs, fontFamily: font.family.bodyBold },
  recentLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontFamily: font.family.bodyBold,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  recentWrap: { flexGrow: 0 },
  recentContent: { gap: spacing.sm },
  recentItem: { alignItems: "center", gap: 3 },
  recentImg: { width: 64, height: 64, borderRadius: radius.md },
  recentPlaceholder: { backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  recentNum: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: font.family.bodyBold },
  controls: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
  },
  shutterRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 4,
    borderColor: palette.cobalt,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.floating,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  sideBtn: { alignItems: "center", gap: 6, paddingBottom: spacing.lg, minWidth: 70 },
  sideChip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  sideLbl: { color: palette.white, fontSize: font.size.xs, fontFamily: font.family.bodyBold },
  toast: {
    position: "absolute",
    bottom: 170,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(22,26,29,0.94)",
    borderWidth: 1,
    borderColor: "rgba(32,197,94,0.4)",
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { color: palette.white, fontSize: font.size.sm, fontFamily: font.family.bodyBold },

  sheetFlex: { flex: 1 },
  sheet: { flex: 1, backgroundColor: palette.background },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetTitle: { fontSize: font.size.xl, fontFamily: font.family.headingHeavy, color: palette.text, letterSpacing: -0.4 },
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
    fontFamily: font.family.bodySemibold,
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
    fontFamily: font.family.bodyBold,
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
