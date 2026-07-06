/** Create Project — short form, no upfront hierarchy building. */

import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ImagePlus } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AppButton, Field } from "@/components/ui";
import { font, palette, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/providers/AppStore";

export default function ProjectNewScreen() {
  const router = useRouter();
  const { createProject, settings } = useAppStore();

  const [name, setName] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [siteAddress, setSiteAddress] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>(settings.companyName);
  const [inspectorName, setInspectorName] = useState<string>(settings.inspectorName);
  const [coverPhotoUri, setCoverPhotoUri] = useState<string | null>(null);
  const [logoUri, setLogoUri] = useState<string | null>(null);

  const pickImage = async (target: "cover" | "logo") => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
      });
      const uri = result.assets?.[0]?.uri;
      if (!result.canceled && uri) {
        if (target === "cover") setCoverPhotoUri(uri);
        else setLogoUri(uri);
      }
    } catch (e) {
      console.log("[project-new] pick image failed", e);
    }
  };

  const save = () => {
    if (!name.trim()) {
      Alert.alert("Project name required", "Give the project a name so it appears on reports.");
      return;
    }
    const project = createProject({
      name: name.trim(),
      clientName: clientName.trim(),
      reference: reference.trim(),
      siteAddress: siteAddress.trim(),
      companyName: companyName.trim(),
      inspectorName: inspectorName.trim(),
      coverPhotoUri,
      logoUri,
    });
    router.replace({ pathname: "/project/[id]", params: { id: project.id } });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Project name" value={name} onChangeText={setName} placeholder="e.g. Harbourview Apartments" autoFocus testID="project-name" />
        <Field label="Client / prepared for" value={clientName} onChangeText={setClientName} placeholder="Client or organisation" optional />
        <Field label="Reference number" value={reference} onChangeText={setReference} placeholder="Job or contract reference" optional />
        <Field label="Site address" value={siteAddress} onChangeText={setSiteAddress} placeholder="Street, suburb, state" optional />
        <Field label="Company name" value={companyName} onChangeText={setCompanyName} placeholder="Your company on report covers" optional />
        <Field label="Inspector name" value={inspectorName} onChangeText={setInspectorName} placeholder="Who prepares the reports" optional />

        <View style={styles.mediaRow}>
          <TouchableOpacity style={styles.mediaBox} activeOpacity={0.8} onPress={() => pickImage("logo")}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.mediaImg} contentFit="cover" />
            ) : (
              <>
                <ImagePlus color={palette.textFaint} size={20} />
                <Text style={styles.mediaLabel}>Logo</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBox} activeOpacity={0.8} onPress={() => pickImage("cover")}>
            {coverPhotoUri ? (
              <Image source={{ uri: coverPhotoUri }} style={styles.mediaImg} contentFit="cover" />
            ) : (
              <>
                <ImagePlus color={palette.textFaint} size={20} />
                <Text style={styles.mediaLabel}>Cover photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.mediaNote}>Both optional — used on the report cover page.</Text>

        <AppButton label="Create Project" onPress={save} style={styles.saveBtn} testID="save-project" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 60 },
  mediaRow: { flexDirection: "row", gap: spacing.md },
  mediaBox: {
    flex: 1,
    height: 92,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  mediaImg: { width: "100%", height: "100%" },
  mediaLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: palette.textMuted },
  mediaNote: { fontSize: font.size.xs, color: palette.textFaint, marginTop: 6 },
  saveBtn: { marginTop: spacing.xl },
});
