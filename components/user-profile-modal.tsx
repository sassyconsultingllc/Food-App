/**
 * User Profile Modal — Local Only
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * No account, no sync. Name and home zip stored on-device.
 */

import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

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
  onSave: (name: string, zip: string) => void;
}

export function UserProfileModal({
  visible,
  onClose,
  displayName,
  homeZip,
  onSave,
}: UserProfileModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const { settings: soundSettings, toggleCelebration } = useSoundSettings();

  const [name, setName] = useState(displayName);
  const [zip, setZip] = useState(homeZip);

  // Sync if parent values change while modal is closed
  useEffect(() => {
    if (visible) {
      setName(displayName);
      setZip(homeZip);
    }
  }, [visible, displayName, homeZip]);

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSave(name.trim(), zip.trim());
    onClose();
  };

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

          {/* Avatar */}
          <View style={[styles.avatarLarge, { backgroundColor: AppColors.copper + "22", borderColor: AppColors.copper }]}>
            {name.trim() ? (
              <ThemedText style={styles.avatarInitialsLarge}>
                {name.trim()[0].toUpperCase()}
              </ThemedText>
            ) : (
              <IconSymbol name="person.fill" size={40} color={AppColors.copper} />
            )}
          </View>

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
  onPress,
  colors,
}: {
  displayName: string;
  onPress: () => void;
  colors: any;
}) {
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
      {displayName.trim() ? (
        <ThemedText style={[styles.avatarInitials, { color: AppColors.copper }]}>
          {displayName.trim()[0].toUpperCase()}
        </ThemedText>
      ) : (
        <IconSymbol name="person.fill" size={20} color={colors.textSecondary} />
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
    marginBottom: Spacing.md,
  },
  avatarInitialsLarge: {
    fontSize: 36,
    fontWeight: "700",
    color: AppColors.copper,
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
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: "700",
  },
});
