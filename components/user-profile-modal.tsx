/**
 * User Profile Modal — Local Only
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * No account, no sync. Name, home zip, and profile picture are stored
 * on-device. The profile picture is saved to the app's persistent
 * document directory so it survives across launches but never leaves
 * the device.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";

import { ThemedText } from "./themed-text";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSoundSettings } from "@/hooks/use-sound-settings";

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  homeZip: string;
  profilePhotoUri?: string;
  onSave: (name: string, zip: string, profilePhotoUri?: string) => void;
}

/**
 * Copy a picked image into the app's persistent document directory and
 * return the new file:// URI. This ensures the image survives across app
 * launches even if the picker's temp cache is purged by the OS.
 */
function persistProfilePhoto(sourceUri: string): string {
  const profileDir = new Directory(Paths.document, "profile");
  if (!profileDir.exists) {
    profileDir.create({ intermediates: true, idempotent: true });
  }
  const ext = sourceUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
  const destFile = new File(profileDir, `avatar_${Date.now()}.${ext}`);
  new File(sourceUri).copy(destFile);
  return destFile.uri;
}

export function UserProfileModal({
  visible,
  onClose,
  displayName,
  homeZip,
  profilePhotoUri,
  onSave,
}: UserProfileModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const { settings: soundSettings, toggleCelebration } = useSoundSettings();

  const [name, setName] = useState(displayName);
  const [zip, setZip] = useState(homeZip);
  const [photoUri, setPhotoUri] = useState<string | undefined>(profilePhotoUri);
  const [picking, setPicking] = useState(false);

  // Sync if parent values change while modal is closed
  useEffect(() => {
    if (visible) {
      setName(displayName);
      setZip(homeZip);
      setPhotoUri(profilePhotoUri);
    }
  }, [visible, displayName, homeZip, profilePhotoUri]);

  const handlePickPhoto = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo access so you can pick a profile picture.",
      );
      return;
    }

    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const persisted = persistProfilePhoto(result.assets[0].uri);
      setPhotoUri(persisted);
    } catch (err) {
      console.warn("[profile] photo pick failed:", err);
      Alert.alert("Couldn't load photo", "Try a different image.");
    } finally {
      setPicking(false);
    }
  }, []);

  const handleRemovePhoto = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhotoUri(undefined);
  }, []);

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSave(name.trim(), zip.trim(), photoUri);
    onClose();
  };

  const trimmedName = name.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardBackground,
              paddingBottom: insets.bottom + Spacing.lg,
            },
          ]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Avatar — tap to pick a new photo */}
          <Pressable
            onPress={handlePickPhoto}
            disabled={picking}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
            style={({ pressed }) => [
              styles.avatarLarge,
              {
                backgroundColor: AppColors.copper + "22",
                borderColor: AppColors.copper,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {picking ? (
              <ActivityIndicator size="small" color={AppColors.copper} />
            ) : photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarPhoto} contentFit="cover" />
            ) : trimmedName ? (
              <ThemedText style={styles.avatarInitialsLarge}>
                {trimmedName[0].toUpperCase()}
              </ThemedText>
            ) : (
              <IconSymbol name="person.fill" size={32} color={AppColors.copper} />
            )}

            {/* Camera badge overlay */}
            <View style={[styles.cameraBadge, { backgroundColor: AppColors.copper, borderColor: colors.cardBackground }]}>
              <IconSymbol name="camera.fill" size={12} color={AppColors.white} />
            </View>
          </Pressable>

          {photoUri && (
            <Pressable onPress={handleRemovePhoto} hitSlop={8} style={styles.removePhotoLink}>
              <ThemedText style={[styles.removePhotoText, { color: colors.textSecondary }]}>
                Remove photo
              </ThemedText>
            </Pressable>
          )}

          <ThemedText type="subtitle" style={styles.sheetTitle}>
            Your Profile
          </ThemedText>
          <ThemedText style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
            Stored on this device only
          </ThemedText>

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            {/* Name */}
            <ThemedText style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Name
            </ThemedText>
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconSymbol name="person" size={18} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={name}
                onChangeText={setName}
                placeholder="Your name (optional)"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="words"
                returnKeyType="next"
                maxLength={40}
              />
            </View>

            {/* Home ZIP */}
            <ThemedText style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Home Zip / Postal Code
            </ThemedText>
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconSymbol name="house.fill" size={18} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={zip}
                onChangeText={setZip}
                placeholder="e.g. 53597"
                placeholderTextColor={colors.textSecondary}
                keyboardType="default"
                autoCapitalize="characters"
                returnKeyType="done"
                maxLength={10}
                onSubmitEditing={handleSave}
              />
            </View>

            {/* Sound / Celebration toggle */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleCelebration();
              }}
              style={({ pressed }) => [
                styles.toggleRow,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <IconSymbol
                name={soundSettings.celebrationEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill"}
                size={20}
                color={soundSettings.celebrationEnabled ? colors.accent : colors.textSecondary}
              />
              <View style={styles.toggleText}>
                <ThemedText style={styles.toggleLabel}>Sound & Celebration</ThemedText>
                <ThemedText style={[styles.toggleSub, { color: colors.textSecondary }]}>
                  {soundSettings.celebrationEnabled ? "On" : "Off"}
                </ThemedText>
              </View>
              <IconSymbol
                name={soundSettings.celebrationEnabled ? "checkmark.circle.fill" : "circle"}
                size={22}
                color={soundSettings.celebrationEnabled ? colors.accent : colors.textSecondary}
              />
            </Pressable>
          </ScrollView>

          {/* Save */}
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: AppColors.copper, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <ThemedText style={styles.saveButtonText}>Save</ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Reusable avatar circle — use in header */
export function UserAvatar({
  displayName,
  profilePhotoUri,
  onPress,
  colors,
}: {
  displayName: string;
  profilePhotoUri?: string;
  onPress: () => void;
  colors: any;
}) {
  const trimmed = displayName.trim();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      style={({ pressed }) => [
        styles.avatarButton,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {profilePhotoUri ? (
        <Image source={{ uri: profilePhotoUri }} style={styles.avatarButtonPhoto} contentFit="cover" />
      ) : trimmed ? (
        <ThemedText style={[styles.avatarInitials, { color: AppColors.copper }]}>
          {trimmed[0].toUpperCase()}
        </ThemedText>
      ) : (
        <IconSymbol name="person.fill" size={18} color={colors.textSecondary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  keyboardView: {
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    alignItems: "center",
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.lg,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
    overflow: "hidden",
    position: "relative",
  },
  avatarPhoto: {
    width: "100%",
    height: "100%",
  },
  avatarInitialsLarge: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "700",
    color: AppColors.copper,
    textAlign: "center",
    // Android: strip default font padding so the glyph centers correctly
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  removePhotoLink: {
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  removePhotoText: {
    fontSize: 12,
    textDecorationLine: "underline",
  },
  sheetTitle: {
    marginBottom: Spacing.xs,
  },
  sheetSubtitle: {
    fontSize: 13,
    marginBottom: Spacing.lg,
  },
  form: {
    width: "100%",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  toggleSub: {
    fontSize: 12,
  },
  saveButton: {
    width: "100%",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  saveButtonText: {
    color: AppColors.white,
    fontSize: 17,
    fontWeight: "700",
  },
  avatarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarButtonPhoto: {
    width: "100%",
    height: "100%",
  },
  avatarInitials: {
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
