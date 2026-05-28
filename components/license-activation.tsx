/**
 * License Activation Screen
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Full-screen license key entry. Used by <LicenseGate> when paywall mode
 * is `enforced` and the user has no valid license. In `evaluation` mode
 * this screen is unreachable from the gate — wire it from Settings if
 * you want testers to be able to try the activation flow.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, BorderRadius, Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLicense } from "@/hooks/use-license";

interface LicenseActivationProps {
  /** Optional bypass button — useful while paywall mode is "evaluation". */
  onContinueWithoutActivation?: () => void;
}

export function LicenseActivationScreen({
  onContinueWithoutActivation,
}: LicenseActivationProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { activate, mode } = useLicense();

  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = useCallback(async () => {
    if (busy) return;
    setError(null);
    const trimmedKey = key.trim();
    const trimmedEmail = email.trim();
    if (!trimmedKey || !trimmedEmail) {
      setError("Enter both your license key and the email it was issued to.");
      return;
    }
    setBusy(true);
    try {
      await activate(trimmedKey, trimmedEmail);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, key, email, activate]);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.iconBubble, { backgroundColor: AppColors.softBlue }]}>
            <IconSymbol name="lock.fill" size={36} color={AppColors.copper} />
          </View>

          <ThemedText type="title" style={styles.heading}>
            Activate Foodie Finder
          </ThemedText>

          <ThemedText style={[styles.subhead, { color: colors.textSecondary }]}>
            Enter the license key you received by email to unlock the app.
          </ThemedText>

          {mode === "evaluation" && (
            <View style={[styles.evalNote, { backgroundColor: AppColors.softBlue }]}>
              <ThemedText style={[styles.evalNoteText, { color: AppColors.charcoal }]}>
                Evaluation build — you can also skip this and use the full app for free.
              </ThemedText>
            </View>
          )}

          <View style={styles.field}>
            <ThemedText style={styles.label}>License key</ThemedText>
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder="FF-XXXX-XXXX-XXXX"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              editable={!busy && !success}
            />
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Email</ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              editable={!busy && !success}
            />
          </View>

          {error && (
            <ThemedText style={[styles.errorText, { color: AppColors.error }]}>
              {error}
            </ThemedText>
          )}
          {success && (
            <ThemedText style={[styles.successText, { color: AppColors.success }]}>
              License activated — welcome aboard.
            </ThemedText>
          )}

          <Pressable
            onPress={submit}
            disabled={busy || success}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: success ? AppColors.success : AppColors.copper,
                opacity: busy ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={AppColors.white} />
            ) : (
              <ThemedText style={styles.primaryBtnText}>
                {success ? "Activated" : "Activate"}
              </ThemedText>
            )}
          </Pressable>

          {onContinueWithoutActivation && mode === "evaluation" && (
            <Pressable
              onPress={onContinueWithoutActivation}
              style={styles.secondaryBtn}
              accessibilityRole="button"
            >
              <ThemedText style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
                Continue without activating
              </ThemedText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: Spacing.lg,
    paddingTop: Spacing.xxl,
    alignItems: "center",
  },
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  heading: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  subhead: {
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  evalNote: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    alignSelf: "stretch",
  },
  evalNoteText: {
    textAlign: "center",
    fontSize: 13,
  },
  field: {
    alignSelf: "stretch",
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  errorText: {
    alignSelf: "stretch",
    marginBottom: Spacing.sm,
    fontSize: 14,
  },
  successText: {
    alignSelf: "stretch",
    marginBottom: Spacing.sm,
    fontSize: 14,
    fontWeight: "600",
  },
  primaryBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  primaryBtnText: {
    color: AppColors.white,
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryBtn: {
    paddingVertical: Spacing.md,
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  secondaryBtnText: {
    fontSize: 14,
  },
});
