/** Issue Detail — full record with photos, markup, status and report controls. */

import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Camera, Copy, PenLine, Trash2 } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { PriorityPill, StatusPill, SyncPill } from "@/components/pills";
import { AppButton, Card, Segmented, SectionTitle, ToggleRow } from "@/components/ui";
import { font, layout, palette, radius, spacing } from "@/constants/theme";
import { showConfirm } from "@/lib/dialogs";
import { formatDateTime, issueRef } from "@/lib/format";
import { newId } from "@/lib/ids";
import { processPickedPhoto } from "@/lib/files";
import { useAppStore } from "@/providers/AppStore";

export default function IssueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    db,
    updateIssue,
    deleteIssue,
    duplicateIssue,
    addPhotosToIssue,
    findOrCreateLocation,
    findOrCreateAssignee,
  } = useAppStore();

  const issue = useMemo(() => db.issues.find((i) => i.id === id && !i.deletedAt) ?? null, [db.issues, id]);
  const assets = useMemo(
    () => db.assets.filter((a) => a.issueId === id && !a.deletedAt),
    [db.assets, id],
  );

  const [editingTitle, setEditingTitle] = useState<boolean>(false);
  const [titleDraft, setTitleDraft] = useState<string>("");
  const [editingDesc, setEditingDesc] = useState<boolean>(false);
  const [descDraft, setDescDraft] = useState<string>("");
  const [locationDraft, setLocationDraft] = useState<string | null>(null);
  const [assigneeDraft, setAssigneeDraft] = useState<string | null>(null);

  if (!issue) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Issue not found.</Text>
      </View>
    );
  }

  const location = db.locations.find((l) => l.id === issue.locationId) ?? null;
  const assignee = db.assignees.find((a) => a.id === issue.assigneeId) ?? null;

  const addPhoto = async (fromCamera: boolean) => {
    try {
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
      const uri = result.assets?.[0]?.uri;
      if (result.canceled || !uri) return;
      const processed = await processPickedPhoto(uri, newId());
      addPhotosToIssue(issue.id, [processed]);
    } catch (e) {
      console.log("[issue] add photo failed", e);
    }
  };

  const confirmDelete = async () => {
    const ok = await showConfirm(
      "Delete issue?",
      `${issueRef(issue.issueNumber)} will be removed from the audit and report.`,
      "Delete",
      true,
    );
    if (ok) {
      deleteIssue(issue.id);
      router.back();
    }
  };

  const saveLocation = () => {
    if (locationDraft === null) return;
    const trimmed = locationDraft.trim();
    updateIssue(issue.id, {
      locationId: trimmed ? findOrCreateLocation(issue.projectId, trimmed).id : null,
    });
    setLocationDraft(null);
  };

  const saveAssignee = () => {
    if (assigneeDraft === null) return;
    const trimmed = assigneeDraft.trim();
    updateIssue(issue.id, {
      assigneeId: trimmed ? findOrCreateAssignee(trimmed).id : null,
    });
    setAssigneeDraft(null);
  };

  return (
    <>
      <Stack.Screen options={{ title: issueRef(issue.issueNumber) }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pillRow}>
          <StatusPill status={issue.status} />
          <PriorityPill priority={issue.priority} />
          <SyncPill status={issue.syncStatus} />
        </View>

        {editingTitle ? (
          <TextInput
            style={styles.titleInput}
            value={titleDraft}
            onChangeText={setTitleDraft}
            autoFocus
            onBlur={() => {
              updateIssue(issue.id, { title: titleDraft.trim() || issue.title });
              setEditingTitle(false);
            }}
          />
        ) : (
          <TouchableOpacity
            onPress={() => {
              setTitleDraft(issue.title);
              setEditingTitle(true);
            }}
          >
            <Text style={styles.title}>{issue.title || "Untitled issue"}</Text>
            <Text style={styles.editHint}>Tap to edit title</Text>
          </TouchableOpacity>
        )}

        <SectionTitle title="Photos" />
        {assets.length === 0 ? (
          <Text style={styles.emptyNote}>No photos on this issue — add one below.</Text>
        ) : null}
        {assets.map((asset) => {
          const annotation = db.annotations.find((an) => an.assetId === asset.id);
          const hasMarkup = !!annotation && annotation.elements.length > 0;
          return (
            <View key={asset.id} style={styles.photoBlock}>
              <Image
                source={{ uri: asset.annotatedUri ?? asset.reportUri }}
                style={[styles.photo, { aspectRatio: asset.width / Math.max(1, asset.height) }]}
                contentFit="cover"
              />
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={() => router.push({ pathname: "/markup/[assetId]", params: { assetId: asset.id } })}
                  testID={`markup-${asset.id}`}
                >
                  <PenLine color={palette.carbon} size={16} />
                  <Text style={styles.photoBtnText}>{hasMarkup ? "Edit markup" : "Mark up"}</Text>
                </TouchableOpacity>
                {hasMarkup ? <Text style={styles.markupNote}>Original preserved · markup stored separately</Text> : null}
              </View>
            </View>
          );
        })}
        <View style={styles.addPhotoRow}>
          <AppButton
            label="Take Photo"
            variant="secondary"
            icon={<Camera color={palette.carbon} size={16} />}
            onPress={() => addPhoto(true)}
            style={styles.addPhotoBtn}
          />
          <AppButton
            label="From Gallery"
            variant="secondary"
            onPress={() => addPhoto(false)}
            style={styles.addPhotoBtn}
          />
        </View>

        <SectionTitle title="Status" />
        <Segmented
          options={[
            { value: "open", label: "Open" },
            { value: "assigned", label: "Assigned" },
            { value: "in_progress", label: "In Prog." },
            { value: "completed", label: "Done" },
          ]}
          value={issue.status}
          onChange={(v) => updateIssue(issue.id, { status: v })}
        />

        <SectionTitle title="Priority" />
        <Segmented
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
          value={issue.priority}
          onChange={(v) => updateIssue(issue.id, { priority: v })}
        />

        <SectionTitle title="Details" />
        <Card>
          <Text style={styles.fieldLbl}>Location</Text>
          {locationDraft !== null ? (
            <TextInput
              style={styles.fieldInput}
              value={locationDraft}
              onChangeText={setLocationDraft}
              autoFocus
              onBlur={saveLocation}
              onSubmitEditing={saveLocation}
              placeholder="e.g. Level 1 Corridor"
              placeholderTextColor={palette.textFaint}
            />
          ) : (
            <TouchableOpacity onPress={() => setLocationDraft(location?.name ?? "")}>
              <Text style={styles.fieldValue}>{location?.name ?? "General — tap to set"}</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.fieldLbl, styles.fieldSpacing]}>Assignee</Text>
          {assigneeDraft !== null ? (
            <TextInput
              style={styles.fieldInput}
              value={assigneeDraft}
              onChangeText={setAssigneeDraft}
              autoFocus
              onBlur={saveAssignee}
              onSubmitEditing={saveAssignee}
              placeholder="Who fixes this"
              placeholderTextColor={palette.textFaint}
            />
          ) : (
            <TouchableOpacity onPress={() => setAssigneeDraft(assignee?.name ?? "")}>
              <Text style={styles.fieldValue}>{assignee?.name ?? "Unassigned — tap to set"}</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.fieldLbl, styles.fieldSpacing]}>Description / notes</Text>
          {editingDesc ? (
            <TextInput
              style={[styles.fieldInput, styles.descInput]}
              value={descDraft}
              onChangeText={setDescDraft}
              autoFocus
              multiline
              onBlur={() => {
                updateIssue(issue.id, { description: descDraft });
                setEditingDesc(false);
              }}
            />
          ) : (
            <TouchableOpacity
              onPress={() => {
                setDescDraft(issue.description);
                setEditingDesc(true);
              }}
            >
              <Text style={styles.fieldValue}>{issue.description || "Tap to add notes"}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.timestamps}>
            <Text style={styles.timestamp}>Created {formatDateTime(issue.createdAt)}</Text>
            <Text style={styles.timestamp}>Updated {formatDateTime(issue.updatedAt)}</Text>
          </View>
        </Card>

        <ToggleRow
          label="Include in report"
          sub="Excluded issues stay in the hit list but are left out of the PDF"
          value={issue.includeInReport}
          onToggle={(v) => updateIssue(issue.id, { includeInReport: v })}
        />

        <View style={styles.dangerRow}>
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={() => {
              const copy = duplicateIssue(issue.id);
              if (copy) router.replace({ pathname: "/issue/[id]", params: { id: copy.id } });
            }}
          >
            <Copy color={palette.carbon} size={16} />
            <Text style={styles.dangerBtnText}>Duplicate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerBtn} onPress={confirmDelete}>
            <Trash2 color={palette.red} size={16} />
            <Text style={[styles.dangerBtnText, styles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: {
    padding: spacing.lg,
    paddingBottom: 80,
    ...(Platform.OS === "web" ? { maxWidth: layout.webMaxWidth, width: "100%", alignSelf: "center" } : null),
  },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  pillRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  title: { fontSize: font.size.xxl, fontFamily: font.family.headingHeavy, color: palette.text, letterSpacing: -0.5 },
  editHint: { fontSize: font.size.xs, color: palette.textFaint, marginTop: 3 },
  titleInput: {
    fontSize: font.size.xl,
    fontFamily: font.family.bodyBold,
    color: palette.text,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  emptyNote: { fontSize: font.size.xs, color: palette.textFaint, marginBottom: spacing.sm },
  photoBlock: { marginBottom: spacing.md },
  photo: { width: "100%", borderRadius: radius.lg, backgroundColor: palette.surfaceAlt },
  photoActions: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  photoBtnText: { fontSize: font.size.sm, fontFamily: font.family.bodyBold, color: palette.carbon },
  markupNote: { flex: 1, fontSize: font.size.xs, color: palette.textFaint },
  addPhotoRow: { flexDirection: "row", gap: spacing.sm },
  addPhotoBtn: { flex: 1, minHeight: 44 },
  fieldLbl: {
    fontSize: font.size.xs,
    fontFamily: font.family.bodyBold,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  fieldSpacing: { marginTop: spacing.md },
  fieldValue: { fontSize: font.size.md, color: palette.text, fontFamily: font.family.bodyMedium, paddingVertical: 2 },
  fieldInput: {
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    fontSize: font.size.md,
    color: palette.text,
  },
  descInput: { minHeight: 70, textAlignVertical: "top" },
  timestamps: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.surfaceAlt,
  },
  timestamp: { fontSize: font.size.xs, color: palette.textFaint },
  dangerRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  dangerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  dangerBtnText: { fontSize: font.size.sm, fontFamily: font.family.bodyBold, color: palette.carbon },
  deleteText: { color: palette.red },
});
