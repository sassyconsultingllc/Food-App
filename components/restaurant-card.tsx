/**
 * Restaurant Card Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Restaurant } from "@/types/restaurant";
import { getOpenStatus } from "@/utils/hours-utils";

interface RestaurantCardProps {
  restaurant: Restaurant;
  onFavoritePress?: () => void;
  isFavorite?: boolean;
  showDistance?: boolean;
  /**
   * When true, render a small "Matches your taste" badge. Set by the
   * parent screen after scoring the restaurant against the user's taste
   * profile (see hooks/use-taste-profile.ts).
   */
  tasteMatch?: boolean;
}

export function RestaurantCard({
  restaurant,
  onFavoritePress,
  isFavorite = false,
  showDistance = true,
  tasteMatch = false,
}: RestaurantCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const router = useRouter();

  const handlePress = () => {
    router.push(`/restaurant/${restaurant.id}` as any);
  };

  const openStatus = restaurant.hours
    ? getOpenStatus(restaurant.hours)
    : { isOpen: false, statusText: "Hours unknown", todayHours: undefined };

  return (
    <Pressable
      onPress={handlePress}
      focusable
      accessibilityLabel={`${restaurant.name}, ${restaurant.cuisineType}, rated ${(restaurant.ratings?.aggregated ?? 0).toFixed(1)} stars${restaurant.distance !== undefined ? `, ${restaurant.distance.toFixed(1)} miles away` : ''}`}
      accessibilityRole="button"
      accessibilityHint="Opens restaurant details"
      style={({ pressed }: { pressed: boolean }) => [
        styles.container,
        {
          backgroundColor: colors.cardBackground,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },

      ]}
    >
      <View style={styles.imageContainer}>
        {restaurant.imageUrl ? (
          <Image
            source={{ uri: restaurant.imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.border }]}>
            <IconSymbol name="fork.knife" size={32} color={colors.textSecondary} />
          </View>
        )}
        {/* Open/Closed Badge on Image */}
        {restaurant.hours && (
          <View
            style={[
              styles.openBadge,
              {
                backgroundColor: openStatus.isOpen
                  ? "rgba(34, 197, 94, 0.9)"
                  : "rgba(239, 68, 68, 0.9)",
              },
            ]}
          >
            <ThemedText style={styles.openBadgeText}>
              {openStatus.isOpen ? "Open" : "Closed"}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.name}>
            {restaurant.name}
          </ThemedText>
          {onFavoritePress && (
            <Pressable
              onPress={(e) => {
                // Stop propagation so tapping the heart doesn't also
                // trigger the parent card's onPress (navigation).
                e.stopPropagation();
                onFavoritePress();
              }}
              hitSlop={8}
              accessibilityLabel={isFavorite ? "Remove from favorites" : "Add to favorites"}
              accessibilityRole="button"
              accessibilityState={{ selected: isFavorite }}
              focusable
              style={undefined}
            >
              <IconSymbol
                name={isFavorite ? "fork.knife.circle.fill" : "fork.knife"}
                size={22}
                color={isFavorite ? AppColors.copper : colors.border}
              />
            </Pressable>
          )}
        </View>

        <View style={styles.meta}>
          <ThemedText style={[styles.cuisine, { color: colors.textSecondary }]}>
            {restaurant.cuisineType}
          </ThemedText>
          {restaurant.priceRange && (
            <ThemedText style={[styles.priceRange, { color: AppColors.copper }]}>
              {" · "}{restaurant.priceRange}
            </ThemedText>
          )}
          {showDistance && restaurant.distance !== undefined && (
            <View style={styles.distanceContainer}>
              <IconSymbol name="mappin.and.ellipse" size={14} color={colors.textSecondary} />
              <ThemedText style={[styles.distance, { color: colors.textSecondary }]}>
                {restaurant.distance.toFixed(1)} mi
              </ThemedText>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={[styles.ratingBadge, { backgroundColor: AppColors.skyBlue }]}>
            <IconSymbol name="star.fill" size={12} color={AppColors.white} />
            <ThemedText style={styles.ratingText}>
              {(restaurant.ratings?.aggregated ?? 0).toFixed(1)}
            </ThemedText>
          </View>

          {restaurant.dailySpecial && (
            <View style={[styles.specialBadge, { backgroundColor: AppColors.lightOrange }]}>
              <IconSymbol name="sparkles" size={12} color={AppColors.white} />
              <ThemedText style={styles.specialText} numberOfLines={1}>
                Special Today
              </ThemedText>
            </View>
          )}

          {restaurant.isCulvers && restaurant.flavorOfTheDay && (
            <View style={[styles.flavorBadge, { backgroundColor: AppColors.copper }]}>
              <IconSymbol name="flame.fill" size={12} color={AppColors.white} />
              <ThemedText style={styles.flavorText} numberOfLines={1}>
                {restaurant.flavorOfTheDay}
              </ThemedText>
            </View>
          )}

          {tasteMatch && (
            <View style={[styles.tasteBadge, { backgroundColor: AppColors.copper }]}>
              <IconSymbol name="sparkles" size={12} color={AppColors.white} />
              <ThemedText style={styles.tasteBadgeText} numberOfLines={1}>
                Your Taste
              </ThemedText>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    padding: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  openBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  openBadgeText: {
    color: AppColors.white,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  content: {
    flex: 1,
    marginLeft: Spacing.sm,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    flex: 1,
    fontSize: 16,
    marginRight: Spacing.sm,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  cuisine: {
    fontSize: 13,
  },
  priceRange: {
    fontSize: 13,
    fontWeight: "600",
  },
  distanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: Spacing.sm,
  },
  distance: {
    fontSize: 13,
    marginLeft: 2,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  ratingText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 3,
  },
  specialBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  specialText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 3,
  },
  flavorBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    maxWidth: 140,
  },
  flavorText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 3,
  },
  tasteBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    gap: 3,
  },
  tasteBadgeText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: "600",
  },
  focusRing: {
    borderWidth: 2,
    borderColor: AppColors.copper,
    shadowColor: AppColors.copper,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  iconFocusRing: {
    borderWidth: 2,
    borderColor: AppColors.copper,
    borderRadius: BorderRadius.full,
    padding: 2,
  },
});
