/**
 * Culver's Flavor Calendar Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Shows upcoming Flavor of the Day for local Culver's.
 * Culver's publishes their calendar monthly - we fetch and display it.
 */

import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { trpc } from "@/lib/trpc";

interface FlavorDay {
  date: string;
  dayName: string;
  flavor: string;
  description?: string;
  isToday: boolean;
}

interface CulversFlavorCalendarProps {
  zipCode: string;
  compact?: boolean;
}

// Popular flavors for when we can't fetch the calendar
const FLAVOR_IMAGES: Record<string, string> = {
  "Turtle": "🐢",
  "OREO": "🍪",
  "Chocolate": "🍫",
  "Caramel": "🍬",
  "Peanut Butter": "🥜",
  "Mint": "🌿",
  "Cookie Dough": "🍪",
  "Strawberry": "🍓",
  "Reese's": "🥜",
  "Cheesecake": "🍰",
  "Butter Pecan": "🥜",
  "Brownie": "🍫",
};

function getFlavorEmoji(flavorName: string): string {
  for (const [key, emoji] of Object.entries(FLAVOR_IMAGES)) {
    if (flavorName.toLowerCase().includes(key.toLowerCase())) {
      return emoji;
    }
  }
  return "🍦";
}

export function CulversFlavorCalendar({ zipCode, compact = false }: CulversFlavorCalendarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  
  const { data, isLoading, error, refetch } = trpc.restaurant.culversFlavorOfDay.useQuery(
    { zipCode },
    { 
      enabled: !!zipCode && zipCode.length === 5,
      staleTime: 30 * 60 * 1000, // 30 minutes
    }
  );
  
  const openCulversWebsite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`https://www.culvers.com/flavor-of-the-day`);
  };
  
  if (isLoading) {
    return (
      <View style={[styles.container, styles.loading, { backgroundColor: colors.cardBackground }]}>
        <ActivityIndicator color={colors.accent} />
        <ThemedText style={[styles.loadingText, { color: colors.textSecondary }]}>
          Finding your Culver's...
        </ThemedText>
      </View>
    );
  }
  
  if (error || !data) {
    return (
      <Pressable 
        onPress={openCulversWebsite}
        style={[styles.container, styles.error, { backgroundColor: colors.cardBackground }]}
      >
        <IconSymbol name="exclamationmark.circle" size={24} color={colors.textSecondary} />
        <ThemedText style={[styles.errorText, { color: colors.textSecondary }]}>
          No Culver's found nearby
        </ThemedText>
        <ThemedText style={[styles.tapText, { color: colors.accent }]}>
          Tap to check online
        </ThemedText>
      </Pressable>
    );
  }
  
  if (compact) {
    return (
      <Pressable 
        onPress={openCulversWebsite}
        style={[styles.compactContainer, { backgroundColor: colors.cardBackground }]}
      >
        <View style={styles.compactLeft}>
          <View style={[styles.culversLogo, { backgroundColor: AppColors.skyBlue }]}>
            <ThemedText style={styles.logoText}>C</ThemedText>
          </View>
          <View style={styles.compactInfo}>
            <ThemedText style={[styles.compactLabel, { color: colors.textSecondary }]}>
              Today's Flavor
            </ThemedText>
            <ThemedText type="defaultSemiBold" numberOfLines={1}>
              {data.flavor}
            </ThemedText>
          </View>
        </View>
        <View style={styles.flavorEmoji}>
          <ThemedText style={styles.emojiText}>{getFlavorEmoji(data.flavor)}</ThemedText>
        </View>
      </Pressable>
    );
  }
  
  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.cardBackground }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.culversLogo, { backgroundColor: AppColors.skyBlue }]}>
            <ThemedText style={styles.logoText}>C</ThemedText>
          </View>
          <View>
            <ThemedText type="defaultSemiBold">Culver's</ThemedText>
            <ThemedText style={[styles.locationText, { color: colors.textSecondary }]} numberOfLines={1}>
              {data.locationName || "Nearest Location"}
            </ThemedText>
          </View>
        </View>
        <Pressable onPress={openCulversWebsite} hitSlop={8}>
          <IconSymbol name="arrow.up.right.square" size={20} color={colors.accent} />
        </Pressable>
      </View>
      
      {/* Today's Flavor - Featured */}
      <View style={[styles.todayCard, { backgroundColor: colors.accent + "15" }]}>
        <View style={styles.todayHeader}>
          <IconSymbol name="star.fill" size={16} color={colors.accent} />
          <ThemedText style={[styles.todayLabel, { color: colors.accent }]}>
            Today's Flavor of the Day
          </ThemedText>
        </View>
        <View style={styles.todayContent}>
          <ThemedText style={styles.bigEmoji}>{getFlavorEmoji(data.flavor)}</ThemedText>
          <View style={styles.todayInfo}>
            <ThemedText type="subtitle" style={styles.flavorName}>
              {data.flavor}
            </ThemedText>
            {data.description && (
              <ThemedText style={[styles.flavorDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                {data.description}
              </ThemedText>
            )}
          </View>
        </View>
      </View>
      
      {/* Nearby Locations */}
      {data.nearbyLocations && data.nearbyLocations.length > 0 && (
        <View style={styles.nearbySection}>
          <ThemedText style={[styles.nearbyTitle, { color: colors.textSecondary }]}>
            Nearby Locations
          </ThemedText>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nearbyScroll}
          >
            {data.nearbyLocations.map((location, index) => (
              <View 
                key={index} 
                style={[styles.nearbyCard, { backgroundColor: colors.surface }]}
              >
                <ThemedText style={styles.nearbyEmoji}>
                  {getFlavorEmoji(location.flavor)}
                </ThemedText>
                <ThemedText numberOfLines={1} style={styles.nearbyFlavor}>
                  {location.flavor}
                </ThemedText>
                <ThemedText 
                  numberOfLines={1} 
                  style={[styles.nearbyAddress, { color: colors.textSecondary }]}
                >
                  {location.address}
                </ThemedText>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      
      {/* View Full Calendar Link */}
      <Pressable 
        onPress={openCulversWebsite}
        style={[styles.calendarLink, { borderTopColor: colors.border }]}
      >
        <ThemedText style={{ color: colors.accent }}>
          View Full Flavor Calendar
        </ThemedText>
        <IconSymbol name="chevron.right" size={14} color={colors.accent} />
      </Pressable>
    </ThemedView>
  );
}

// Widget-style mini component for home screen
export function CulversFlavorWidget({ zipCode }: { zipCode: string }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  
  const { data, isLoading } = trpc.restaurant.culversFlavorOfDay.useQuery(
    { zipCode },
    { enabled: !!zipCode && zipCode.length === 5 }
  );
  
  if (isLoading || !data) return null;
  
  return (
    <View style={[styles.widget, { backgroundColor: AppColors.skyBlue + "20" }]}>
      <ThemedText style={styles.widgetEmoji}>{getFlavorEmoji(data.flavor)}</ThemedText>
      <View style={styles.widgetInfo}>
        <ThemedText style={[styles.widgetLabel, { color: colors.textSecondary }]}>
          Culver's Today
        </ThemedText>
        <ThemedText style={styles.widgetFlavor} numberOfLines={1}>
          {data.flavor}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  loading: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 14,
  },
  error: {
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  errorText: {
    fontSize: 14,
  },
  tapText: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  culversLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: AppColors.white,
    fontSize: 20,
    fontWeight: "bold",
  },
  locationText: {
    fontSize: 12,
    maxWidth: 200,
  },
  todayCard: {
    margin: Spacing.md,
    marginTop: 0,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  todayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  todayContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  bigEmoji: {
    fontSize: 48,
  },
  todayInfo: {
    flex: 1,
  },
  flavorName: {
    fontSize: 20,
  },
  flavorDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  nearbySection: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  nearbyTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nearbyScroll: {
    gap: Spacing.sm,
  },
  nearbyCard: {
    width: 120,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  nearbyEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  nearbyFlavor: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  nearbyAddress: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 2,
  },
  calendarLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
    borderTopWidth: 1,
  },
  // Compact styles
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  compactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  compactInfo: {
    flex: 1,
  },
  compactLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  flavorEmoji: {
    marginLeft: Spacing.sm,
  },
  emojiText: {
    fontSize: 28,
  },
  // Widget styles
  widget: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  widgetEmoji: {
    fontSize: 24,
  },
  widgetInfo: {
    flex: 1,
  },
  widgetLabel: {
    fontSize: 10,
    textTransform: "uppercase",
  },
  widgetFlavor: {
    fontSize: 13,
    fontWeight: "600",
  },
});
