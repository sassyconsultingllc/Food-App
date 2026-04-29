/**
 * OAuth Callback (no-auth build)
 *
 * Foodie Finder ships without user authentication — favorites and notes
 * are stored locally on device. This route remains in the app config /
 * deep-link allowlist because removing it would break any legacy share
 * URLs already pointing at /oauth/callback. Instead of returning null
 * (which renders a blank screen if a user actually lands here), redirect
 * to the home tab and surface a brief "no account needed" message.
 */
import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function OAuthCallback() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  // Bounce to home after a short delay so the user sees the explanation
  // instead of a flash. setTimeout is intentional — using replace()
  // synchronously would skip the brief explanatory frame.
  useEffect(() => {
    const t = setTimeout(() => router.replace("/(tabs)" as never), 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false, title: "Foodie Finder" }} />
      <ActivityIndicator size="large" color={colors.accent} />
      <ThemedText type="subtitle" style={styles.title}>
        No account needed
      </ThemedText>
      <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
        Foodie Finder runs entirely on your device — your favorites and
        notes never leave your phone. Taking you to the app…
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  title: {
    marginTop: Spacing.md,
    textAlign: "center",
  },
  body: {
    marginTop: Spacing.sm,
    textAlign: "center",
    maxWidth: 320,
  },
});
