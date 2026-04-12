/**
 * Public Notes Section ("Community Tips")
 * Ac 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Displays and submits public notes for a restaurant.
 * Uses pii-guard.ts for client-side PII detection + content moderation.
 * Backend: getPublicNotes / addPublicNote via tRPC.
 */

import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { checkPublicNote } from "@/utils/pii-guard";
import { trpc } from "@/lib/trpc";

// Matches the server shape: { text, name?, ts }
interface PublicNote {
  text: string;
  name?: string;
  ts: number;
}

interface PublicNotesSectionProps {
  restaurantId: string;
  restaurantName: string;
}

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function PublicNotesSection({ restaurantId, restaurantName }: PublicNotesSectionProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [newNote, setNewNote] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showInput, setShowInput] = useState(false);

  const notesQuery = trpc.restaurant.getPublicNotes.useQuery(
    { restaurantId },
    { staleTime: 30_000 }
  );
  const addNoteMutation = trpc.restaurant.addPublicNote.useMutation({
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewNote("");
      setShowInput(false);
      notesQuery.refetch();
    },
    onError: (err) => {
      // Map tRPC error codes to friendly text so the user never sees a
      // raw "TRPCClientError: ..." in production.
      const code = (err as any)?.data?.code as string | undefined;
      let msg = "Couldn't post your note. Please try again.";
      if (code === "BAD_REQUEST") {
        // Content guard rejected — the server's reason is user-safe.
        msg = err.message || "Your note couldn't be posted.";
      } else if (code === "TOO_MANY_REQUESTS") {
        msg = "You've posted a lot of notes recently. Please wait a bit and try again.";
      } else if (code === "SERVICE_UNAVAILABLE" || code === "INTERNAL_SERVER_ERROR") {
        msg = "Public notes are temporarily unavailable. Please try again later.";
      }
      Alert.alert("Couldn't post note", msg);
    },
  });

  const notes: PublicNote[] = notesQuery.data?.notes ?? [];
  const loading = notesQuery.isLoading;
  const submitting = addNoteMutation.isPending;

  const handleSubmit = async () => {
    const text = newNote.trim();
    if (!text) return;

    // Client-side PII + moderation check
    const check = checkPublicNote(text);

    if (check.blocked) {
      Alert.alert("Can't post this", check.blockReason || "Content not allowed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (check.piiWarning) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Heads up",
          check.piiWarning + "\n\nCommunity tips are visible to everyone. Post anyway?",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Post anyway", onPress: () => resolve(true) },
          ]
        );
      });
      if (!proceed) return;
    }

    addNoteMutation.mutate({
      restaurantId,
      text,
      displayName: displayName.trim() || undefined,
    });
  };

  const renderNote = ({ item }: { item: PublicNote }) => (
    <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.noteHeader}>
        <View style={styles.noteAuthor}>
          <IconSymbol name="person.circle" size={16} color={colors.accent} />
          <ThemedText style={[styles.authorName, { color: colors.text }]}>
            {item.name || "Anonymous"}
          </ThemedText>
        </View>
        <ThemedText style={[styles.noteTime, { color: colors.textSecondary }]}>
          {timeAgo(item.ts)}
        </ThemedText>
      </View>
      <ThemedText style={[styles.noteText, { color: colors.textSecondary }]}>
        {item.text}
      </ThemedText>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.cardBackground,
          borderLeftColor: AppColors.copper,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <IconSymbol name="bubble.left.and.bubble.right.fill" size={20} color={AppColors.copper} />
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Community Tips
        </ThemedText>
        {notes.length > 0 && (
          <View style={[styles.countPill, { backgroundColor: AppColors.copper }]}>
            <ThemedText style={styles.countPillText}>{notes.length}</ThemedText>
          </View>
        )}
      </View>

      <ThemedText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Tips from other diners — best dish, what to avoid, parking, wait times.
      </ThemedText>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <ThemedText style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading community tips…
          </ThemedText>
        </View>
      ) : notes.length > 0 ? (
        <View style={styles.notesList}>
          {notes.slice(0, 10).map((note, idx) => (
            <View key={`${note.ts}-${idx}`}>{renderNote({ item: note })}</View>
          ))}
          {notes.length > 10 && (
            <ThemedText style={[styles.moreNotesText, { color: colors.textSecondary }]}>
              + {notes.length - 10} more tip{notes.length - 10 === 1 ? "" : "s"}
            </ThemedText>
          )}
        </View>
      ) : (
        <View style={[styles.emptyState, { borderColor: colors.border }]}>
          <IconSymbol name="bubble.left" size={28} color={colors.textSecondary} />
          <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
            No tips yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
            Be the first to share what you know about {restaurantName}.
          </ThemedText>
        </View>
      )}

      {showInput ? (
        <View style={[styles.inputSection, { borderColor: colors.border }]}>
          <TextInput
            style={[styles.nameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name (optional)"
            placeholderTextColor={colors.textSecondary}
            maxLength={30}
          />
          <TextInput
            style={[styles.noteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={newNote}
            onChangeText={setNewNote}
            placeholder={`Tip about ${restaurantName}...`}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={280}
          />
          <View style={styles.inputActions}>
            <ThemedText style={[styles.charCount, { color: colors.textSecondary }]}>
              {newNote.length}/280
            </ThemedText>
            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => { setShowInput(false); setNewNote(""); }}
                style={[styles.cancelButton, { borderColor: colors.border }]}
              >
                <ThemedText style={{ color: colors.textSecondary }}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={submitting || !newNote.trim()}
                style={[
                  styles.submitButton,
                  { backgroundColor: newNote.trim() ? colors.accent : colors.border },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={AppColors.white} />
                ) : (
                  <ThemedText style={styles.submitText}>Post</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowInput(true);
          }}
          style={({ pressed }) => [
            styles.addTipButton,
            { backgroundColor: AppColors.copper, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <IconSymbol name="plus.bubble.fill" size={18} color={AppColors.white} />
          <ThemedText style={styles.addTipText}>Share a tip</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    flex: 1,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: Spacing.md,
  },
  countPill: {
    minWidth: 24,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: Spacing.xs,
  },
  moreNotesText: {
    fontSize: 12,
    textAlign: "center",
    paddingTop: Spacing.xs,
    fontStyle: "italic",
  },
  notesList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  noteCard: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  noteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  noteAuthor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  authorName: {
    fontSize: 13,
    fontWeight: "600",
  },
  noteTime: {
    fontSize: 11,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  inputSection: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  inputActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  charCount: {
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  cancelButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  submitButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    minWidth: 60,
    alignItems: "center",
  },
  submitText: {
    color: AppColors.white,
    fontWeight: "600",
  },
  addTipButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: BorderRadius.sm,
  },
  addTipText: {
    color: AppColors.white,
    fontSize: 15,
    fontWeight: "600",
  },
});
