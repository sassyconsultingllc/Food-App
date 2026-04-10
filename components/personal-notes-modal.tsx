/**
 * Personal Notes Modal
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Add personal notes to favorite restaurants.
 * "Get the fish tacos", "Avoid on weekends", etc.
 */

import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface PersonalNotesModalProps {
  visible: boolean;
  onClose: () => void;
  restaurantName: string;
  currentNotes: string;
  onSave: (notes: string) => void;
}

const QUICK_NOTES = [
  "🌟 Must try!",
  "🐟 Get the fish",
  "🌮 Amazing tacos",
  "🍕 Best pizza",
  "📅 Avoid weekends",
  "🪑 Sit outside",
  "🅿️ Park in back",
  "💳 Cash only",
  "🎂 Good for groups",
  "🤫 Hidden gem",
];

export function PersonalNotesModal({
  visible,
  onClose,
  restaurantName,
  currentNotes,
  onSave,
}: PersonalNotesModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const [notes, setNotes] = useState(currentNotes);
  
  useEffect(() => {
    setNotes(currentNotes);
  }, [currentNotes, visible]);
  
  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(notes.trim());
    onClose();
  };
  
  const appendQuickNote = (quickNote: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotes(prev => prev ? `${prev}\n${quickNote}` : quickNote);
  };
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ThemedView style={styles.container}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable onPress={onClose} hitSlop={12}>
              <ThemedText style={{ color: colors.textSecondary }}>Cancel</ThemedText>
            </Pressable>
            <View style={styles.headerTitle}>
              <IconSymbol name="note.text" size={18} color={colors.accent} />
              <ThemedText type="defaultSemiBold">Personal Notes</ThemedText>
            </View>
            <Pressable onPress={handleSave} hitSlop={12}>
              <ThemedText style={{ color: colors.accent, fontWeight: "600" }}>Save</ThemedText>
            </Pressable>
          </View>
          
          <View style={styles.content}>
            {/* Restaurant Name */}
            <View style={[styles.restaurantBadge, { backgroundColor: colors.surface }]}>
              <IconSymbol name="fork.knife" size={16} color={colors.accent} />
              <ThemedText numberOfLines={1} style={styles.restaurantName}>
                {restaurantName}
              </ThemedText>
            </View>
            
            {/* Notes Input */}
            <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Add your personal notes..."
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[styles.input, { color: colors.text }]}
                textAlignVertical="top"
                autoFocus
              />
            </View>
            
            {/* Quick Add Section */}
            <View style={styles.quickSection}>
              <ThemedText type="defaultSemiBold" style={styles.quickTitle}>
                Quick Add
              </ThemedText>
              <View style={styles.quickGrid}>
                {QUICK_NOTES.map((note) => (
                  <Pressable
                    key={note}
                    onPress={() => appendQuickNote(note)}
                    style={[styles.quickChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <ThemedText style={styles.quickText}>{note}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  restaurantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignSelf: "flex-start",
  },
  restaurantName: {
    fontWeight: "600",
    maxWidth: 250,
  },
  inputContainer: {
    flex: 1,
    maxHeight: 200,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  quickSection: {
    gap: Spacing.sm,
  },
  quickTitle: {
    fontSize: 14,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  quickChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  quickText: {
    fontSize: 13,
  },
});
