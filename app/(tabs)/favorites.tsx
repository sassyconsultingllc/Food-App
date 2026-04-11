/**
 * Favorites Screen - Structured Notepad with AI Recommendations
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useCallback, useState, useEffect } from "react";
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLocation } from "@/hooks/use-location";
import { useRestaurantStorage } from "@/hooks/use-restaurant-storage";
import { useTasteProfile } from "@/hooks/use-taste-profile";
import { TasteMatchesSection } from "@/components/taste-matches-section";
import { Restaurant } from "@/types/restaurant";
import { getOpenStatus } from "@/utils/hours-utils";
import { formatDisplayAddress } from "@/utils/address-utils";


function FavoriteItem({
  restaurant,
  isExpanded,
  onToggleExpand,
  onToggleFavorite,
  notes,
  onNotesChange,
  onViewDetails,
  colors,
}: {
  restaurant: Restaurant;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleFavorite: () => void;
  notes: string | undefined;
  onNotesChange: (text: string) => void;
  onViewDetails: () => void;
  colors: any;
}) {
  const [localNotes, setLocalNotes] = useState(notes || "");
  const openStatus = getOpenStatus(restaurant.hours);

  useEffect(() => {
    setLocalNotes(notes || "");
  }, [notes]);

  const handleNotesBlur = () => {
    if (localNotes !== (notes || "")) {
      onNotesChange(localNotes);
    }
  };

  return (
    <View style={[styles.favoriteItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      {/* Collapsed Row */}
      <Pressable onPress={onToggleExpand} style={styles.favoriteHeader}>
        <IconSymbol
          name="fork.knife.circle.fill"
          size={22}
          color={AppColors.copper}
        />
        <View style={styles.favoriteHeaderInfo}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {restaurant.name}
          </ThemedText>
          <ThemedText style={[styles.favoriteCuisine, { color: colors.textSecondary }]} numberOfLines={1}>
            {restaurant.cuisineType}
          </ThemedText>
        </View>
        {restaurant.distance !== undefined && (
          <ThemedText style={[styles.favoriteDistance, { color: colors.textSecondary }]}>
            {restaurant.distance.toFixed(1)} mi
          </ThemedText>
        )}
        <IconSymbol
          name={isExpanded ? "chevron.up" : "chevron.down"}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {/* Expanded Details */}
      {isExpanded && (
        <View style={styles.favoriteDetails}>
          <View style={styles.detailRow}>
            <IconSymbol name="mappin.and.ellipse" size={16} color={colors.accent} />
            <ThemedText style={[styles.detailText, { color: colors.textSecondary }]} numberOfLines={2}>
              {formatDisplayAddress(restaurant.address, restaurant.city, restaurant.state, restaurant.zipCode)}
            </ThemedText>
          </View>

          {restaurant.phone && (
            <View style={styles.detailRow}>
              <IconSymbol name="phone.fill" size={16} color={colors.accent} />
              <ThemedText style={[styles.detailText, { color: colors.textSecondary }]}>
                {restaurant.phone}
              </ThemedText>
            </View>
          )}

          <View style={styles.detailRow}>
            <IconSymbol name="star.fill" size={16} color={AppColors.copper} />
            <ThemedText style={[styles.detailText, { color: colors.textSecondary }]}>
              {restaurant.ratings.aggregated.toFixed(1)} rating
            </ThemedText>
          </View>

          {openStatus && (
            <View style={styles.detailRow}>
              <IconSymbol name="clock.fill" size={16} color={openStatus.isOpen ? AppColors.success : AppColors.copper} />
              <ThemedText style={[styles.detailText, { color: openStatus.isOpen ? AppColors.success : AppColors.copper }]}>
                {openStatus.statusText}
              </ThemedText>
            </View>
          )}

          <View style={styles.notesContainer}>
            <ThemedText style={[styles.notesLabel, { color: colors.textSecondary }]}>
              Notes
            </ThemedText>
            <TextInput
              style={[styles.notesInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={localNotes}
              onChangeText={setLocalNotes}
              onBlur={handleNotesBlur}
              placeholder="Add personal notes..."
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.favoriteActions}>
            <Pressable
              onPress={onViewDetails}
              style={[styles.viewDetailsButton, { backgroundColor: colors.accent }]}
            >
              <ThemedText style={styles.viewDetailsText}>View Details</ThemedText>
            </Pressable>
            <Pressable
              onPress={onToggleFavorite}
              style={[styles.removeButton, { borderColor: AppColors.copper }]}
            >
              <IconSymbol name="xmark" size={14} color={AppColors.copper} />
              <ThemedText style={[styles.removeText, { color: AppColors.copper }]}>Remove</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const router = useRouter();

  const {
    restaurants,
    preferences,
    getFavoriteRestaurants,
    getRestaurantsWithDistance,
    toggleFavorite,
    getRestaurantById,
    updateRestaurantNotes,
    getRestaurantNotes,
  } = useRestaurantStorage();

  const { latitude, longitude } = useLocation();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [randomPick, setRandomPick] = useState<Restaurant | null>(null);
  const buttonScale = useSharedValue(1);

  const userCoords = useMemo(() => {
    return latitude && longitude ? { lat: latitude, lon: longitude } : null;
  }, [latitude, longitude]);

  const favoriteRestaurants = useMemo(() => {
    const favorites = getFavoriteRestaurants();
    const withDistance = getRestaurantsWithDistance(userCoords);

    return favorites.map((fav) => {
      const withDist = withDistance.find((r) => r.id === fav.id);
      return withDist || fav;
    });
  }, [getFavoriteRestaurants, getRestaurantsWithDistance, userCoords]);

  // Derive taste profile + cross-locale matches from favorites. These
  // recompute automatically as the user favorites/unfavorites restaurants
  // or searches new areas (which expands the pool of candidates).
  const homeCity = useMemo(() => {
    // Infer home city from the most recent favorite's city, or the first
    // restaurant in the local cache that matches the user's saved postal code.
    if (favoriteRestaurants.length > 0) {
      return favoriteRestaurants[0].city;
    }
    const homeZip = preferences.defaultZipCode || preferences.defaultPostalCode;
    if (homeZip) {
      const match = restaurants.find(
        (r) => r.zipCode === homeZip || r.postalCode === homeZip
      );
      return match?.city;
    }
    return undefined;
  }, [favoriteRestaurants, restaurants, preferences.defaultZipCode, preferences.defaultPostalCode]);

  const { profile, crossLocaleMatches, localMatches } = useTasteProfile(
    favoriteRestaurants,
    restaurants,
    {
      city: homeCity,
      postalCode: preferences.defaultZipCode || preferences.defaultPostalCode,
    }
  );

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleToggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleRandomFromFavorites = useCallback(() => {
    if (favoriteRestaurants.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    buttonScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withSpring(1.1),
      withSpring(1)
    );

    const randomIndex = Math.floor(Math.random() * favoriteRestaurants.length);
    const pick = favoriteRestaurants[randomIndex];
    setRandomPick(pick);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds(new Set([pick.id]));

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [favoriteRestaurants, buttonScale]);

  const renderFavorite = useCallback(({ item }: { item: Restaurant }) => (
    <FavoriteItem
      restaurant={item}
      isExpanded={expandedIds.has(item.id)}
      onToggleExpand={() => handleToggleExpand(item.id)}
      onToggleFavorite={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        toggleFavorite(item);
      }}
      notes={getRestaurantNotes(item.id)}
      onNotesChange={(text) => updateRestaurantNotes(item.id, text)}
      onViewDetails={() => router.push(`/restaurant/${item.id}`)}
      colors={colors}
    />
  ), [expandedIds, handleToggleExpand, toggleFavorite, getRestaurantNotes, updateRestaurantNotes, router, colors]);

  const keyExtractor = useCallback((item: Restaurant) => item.id, []);

  const ListHeader = useMemo(() => (
    favoriteRestaurants.length > 0 ? (
      <View style={styles.headerActions}>
        <Pressable onPress={handleRandomFromFavorites}>
          <Animated.View
            style={[
              styles.randomButton,
              { backgroundColor: colors.accent },
              animatedButtonStyle,
            ]}
          >
            <IconSymbol name="shuffle" size={20} color={AppColors.white} />
            <ThemedText style={styles.randomButtonText}>
              Pick from Favorites
            </ThemedText>
          </Animated.View>
        </Pressable>

        {randomPick && (
          <View style={[styles.randomPickBanner, { backgroundColor: AppColors.copper + '15', borderColor: AppColors.copper }]}>
            <IconSymbol name="fork.knife.circle.fill" size={18} color={AppColors.copper} />
            <ThemedText type="defaultSemiBold" style={{ flex: 1 }}>
              {randomPick.name}
            </ThemedText>
            <Pressable onPress={() => router.push(`/restaurant/${randomPick.id}`)}>
              <ThemedText style={{ color: colors.accent, fontWeight: '600' }}>View</ThemedText>
            </Pressable>
          </View>
        )}

        {/* Taste-profile based recommendations — local + cross-locale.
            Entirely client-side, populates from the user's favorites +
            the restaurant cache across all searched areas. */}
        <TasteMatchesSection
          localMatches={localMatches}
          crossLocaleMatches={crossLocaleMatches}
          sampleSize={profile.sampleSize}
        />

        <ThemedText type="subtitle" style={styles.listTitle}>
          All Favorites ({favoriteRestaurants.length})
        </ThemedText>
      </View>
    ) : null
  ), [favoriteRestaurants.length, handleRandomFromFavorites, randomPick, colors, animatedButtonStyle, localMatches, crossLocaleMatches, profile.sampleSize, router]);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <IconSymbol name="fork.knife.circle.fill" size={28} color={colors.accent} />
        <ThemedText type="title" style={styles.title}>
          Favorites
        </ThemedText>
      </View>

      {favoriteRestaurants.length > 0 ? (
        <FlatList
          data={favoriteRestaurants}
          renderItem={renderFavorite}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <IconSymbol name="fork.knife" size={64} color={colors.border} />
          <ThemedText type="subtitle" style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            No Favorites Yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
            Tap the utensils icon on any restaurant to save it here.
          </ThemedText>
          <Pressable
            onPress={() => router.push("/(tabs)/browse")}
            style={[styles.browseButton, { backgroundColor: colors.accent }]}
          >
            <ThemedText style={styles.browseButtonText}>
              Browse Restaurants
            </ThemedText>
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: 32,
  },
  headerActions: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  randomButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  randomButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  randomPickBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  listTitle: {
    marginTop: Spacing.lg,
    marginLeft: Spacing.md,
  },
  listContent: {
    paddingTop: Spacing.sm,
  },
  favoriteItem: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  favoriteHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  favoriteHeaderInfo: {
    flex: 1,
  },
  favoriteCuisine: {
    fontSize: 13,
    marginTop: 2,
  },
  favoriteDistance: {
    fontSize: 13,
    fontWeight: "500",
  },
  favoriteDetails: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
  },
  notesContainer: {
    marginTop: Spacing.sm,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notesInput: {
    minHeight: 60,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  favoriteActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  viewDetailsButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  viewDetailsText: {
    color: AppColors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  removeText: {
    fontWeight: "600",
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    marginTop: Spacing.md,
  },
  emptyText: {
    textAlign: "center",
    lineHeight: 22,
  },
  browseButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  browseButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
});
