/**
 * Taste Matches Section
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Two-tab recommendations block:
 *   1. "In Your Area"      — local spots you haven't tried that match your taste
 *   2. "When You Travel"   — cross-locale spots to try on trips
 *
 * Both are derived from the user's favorites via use-taste-profile.
 * Pure client-side; no server/vector index required.
 */

import React, { useState } from "react";
import { Pressable, StyleSheet, View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ScoredRestaurant } from "@/hooks/use-taste-profile";

interface TasteMatchesSectionProps {
  localMatches: ScoredRestaurant[];
  crossLocaleMatches: ScoredRestaurant[];
  sampleSize: number;
}

type Tab = "local" | "travel";

export function TasteMatchesSection({
  localMatches,
  crossLocaleMatches,
  sampleSize,
}: TasteMatchesSectionProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const [activeTab, setActiveTab] = useState<Tab>("local");

  // Hide the section entirely if there's nothing to show and the user has
  // no favorites to anchor the taste profile.
  if (
    sampleSize === 0 ||
    (localMatches.length === 0 && crossLocaleMatches.length === 0)
  ) {
    return null;
  }

  const matches = activeTab === "local" ? localMatches : crossLocaleMatches;
  const otherHasResults =
    activeTab === "local" ? crossLocaleMatches.length > 0 : localMatches.length > 0;

  const handlePress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/restaurant/${id}` as any);
  };

  const renderEmpty = () => (
    <View style={[styles.emptyBox, { borderColor: colors.border }]}>
      <IconSymbol name="magnifyingglass" size={24} color={colors.textSecondary} />
      <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
        {activeTab === "local"
          ? "No new local matches yet. Favorite a few more places to tune your taste profile."
          : "Search restaurants in another city and we'll highlight matches here."}
      </ThemedText>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.cardBackground, borderLeftColor: AppColors.copper }]}>
      <View style={styles.header}>
        <IconSymbol name="sparkles" size={20} color={AppColors.copper} />
        <ThemedText type="subtitle" style={styles.title}>
          Matches Your Taste
        </ThemedText>
      </View>
      <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
        Built from your {sampleSize} favorite{sampleSize === 1 ? "" : "s"}
      </ThemedText>

      {/* Tab switcher */}
      <View style={[styles.tabRow, { borderColor: colors.border }]}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("local");
          }}
          style={[
            styles.tab,
            activeTab === "local" && {
              backgroundColor: AppColors.copper,
            },
          ]}
        >
          <IconSymbol
            name="location.fill"
            size={14}
            color={activeTab === "local" ? AppColors.white : colors.textSecondary}
          />
          <ThemedText
            style={[
              styles.tabText,
              { color: activeTab === "local" ? AppColors.white : colors.textSecondary },
            ]}
          >
            In Your Area {localMatches.length > 0 && `(${localMatches.length})`}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("travel");
          }}
          style={[
            styles.tab,
            activeTab === "travel" && {
              backgroundColor: AppColors.copper,
            },
          ]}
        >
          <IconSymbol
            name="airplane"
            size={14}
            color={activeTab === "travel" ? AppColors.white : colors.textSecondary}
          />
          <ThemedText
            style={[
              styles.tabText,
              { color: activeTab === "travel" ? AppColors.white : colors.textSecondary },
            ]}
          >
            When You Travel {crossLocaleMatches.length > 0 && `(${crossLocaleMatches.length})`}
          </ThemedText>
        </Pressable>
      </View>

      {matches.length === 0 ? (
        renderEmpty()
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {matches.map((m) => (
            <Pressable
              key={m.restaurant.id}
              onPress={() => handlePress(m.restaurant.id)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.matchBadge, { backgroundColor: AppColors.copper }]}>
                  <IconSymbol name="sparkles" size={10} color={AppColors.white} />
                  <ThemedText style={styles.matchBadgeText}>
                    {Math.round(m.score * 100)}%
                  </ThemedText>
                </View>
                {activeTab === "travel" && m.restaurant.city && (
                  <ThemedText
                    style={[styles.cityLabel, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {m.restaurant.city}
                    {m.restaurant.state ? `, ${m.restaurant.state}` : ""}
                  </ThemedText>
                )}
              </View>
              <ThemedText
                type="defaultSemiBold"
                style={[styles.cardName, { color: colors.text }]}
                numberOfLines={2}
              >
                {m.restaurant.name}
              </ThemedText>
              <ThemedText
                style={[styles.cardCuisine, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {m.restaurant.cuisineType}
                {m.restaurant.priceRange ? ` · ${m.restaurant.priceRange}` : ""}
              </ThemedText>
              {m.restaurant.ratings?.aggregated ? (
                <View style={styles.ratingRow}>
                  <IconSymbol name="star.fill" size={12} color={AppColors.copper} />
                  <ThemedText style={[styles.ratingText, { color: colors.text }]}>
                    {m.restaurant.ratings.aggregated.toFixed(1)}
                  </ThemedText>
                </View>
              ) : null}
              <ThemedText
                style={[styles.reason, { color: AppColors.copper }]}
                numberOfLines={2}
              >
                {m.reason}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {matches.length === 0 && otherHasResults && (
        <Pressable
          onPress={() => setActiveTab(activeTab === "local" ? "travel" : "local")}
          style={styles.switchHint}
        >
          <ThemedText style={[styles.switchHintText, { color: AppColors.copper }]}>
            Try the {activeTab === "local" ? "\"When You Travel\"" : "\"In Your Area\""} tab →
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const CARD_WIDTH = 180;

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    marginBottom: 0,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  tabRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
  },
  scrollContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  card: {
    width: CARD_WIDTH,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  matchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  matchBadgeText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: "700",
  },
  cityLabel: {
    fontSize: 11,
    flex: 1,
    textAlign: "right",
    marginLeft: 4,
  },
  cardName: {
    fontSize: 14,
    lineHeight: 18,
  },
  cardCuisine: {
    fontSize: 12,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "600",
  },
  reason: {
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
  switchHint: {
    alignItems: "center",
    paddingTop: Spacing.sm,
  },
  switchHintText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
