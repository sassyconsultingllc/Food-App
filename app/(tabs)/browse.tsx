/**
 * Browse Screen - Restaurant List with Filters + AI Semantic Search
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import * as Haptics from "expo-haptics";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RestaurantCard } from "@/components/restaurant-card";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLocation } from "@/hooks/use-location";
import { useRestaurantStorage } from "@/hooks/use-restaurant-storage";
import { useResponsive } from "@/hooks/use-responsive";
import { useSemanticSearch, useVectorStats } from "@/hooks/use-semantic-search";
import { useTasteProfile } from "@/hooks/use-taste-profile";
import { Restaurant, DIETARY_OPTIONS, DietaryOption } from "@/types/restaurant";
import { isOpenNow } from "@/utils/hours-utils";
import { useAppSounds } from "@/hooks/use-app-sounds";
import { useSoundSettings } from "@/hooks/use-sound-settings";

// Quick filter options
const QUICK_FILTERS = [
  { key: "all", label: "All", icon: null },
  { key: "open", label: "Open Now", icon: "clock.fill" },
  { key: "specials", label: "Has Specials", icon: "sparkles" },
  { key: "culvers", label: "Culver's", icon: "flame.fill" },
  { key: "nearby", label: "< 3 mi", icon: "location.fill" },
];

// Price range filters
const PRICE_FILTERS = [
  { key: "all", label: "Any Price" },
  { key: "$", label: "$" },
  { key: "$$", label: "$$" },
  { key: "$$$", label: "$$$" },
  { key: "$$$$", label: "$$$$" },
];

// Cuisine type filters
const CUISINE_TYPES = [
  { key: "all", label: "All Cuisines", emoji: "🍽️" },
  { key: "American", label: "American", emoji: "🍔" },
  { key: "Italian", label: "Italian", emoji: "🍕" },
  { key: "Mexican", label: "Mexican", emoji: "🌮" },
  { key: "Asian", label: "Asian", emoji: "🍜" },
  { key: "Vietnamese", label: "Vietnamese", emoji: "🍲" },
  { key: "Chinese", label: "Chinese", emoji: "🥡" },
  { key: "Japanese", label: "Japanese", emoji: "🍣" },
  { key: "Thai", label: "Thai", emoji: "🍛" },
  { key: "Indian", label: "Indian", emoji: "🍛" },
  { key: "Mediterranean", label: "Mediterranean", emoji: "🥙" },
  { key: "BBQ", label: "BBQ", emoji: "🍖" },
  { key: "Seafood", label: "Seafood", emoji: "🦞" },
  { key: "Fast Food", label: "Fast Food", emoji: "🍟" },
  { key: "Pizza", label: "Pizza", emoji: "🍕" },
  { key: "Breakfast", label: "Breakfast", emoji: "🥞" },
  { key: "Dessert", label: "Dessert", emoji: "🍰" },
  { key: "Cafe", label: "Cafe", emoji: "☕" },
];

// AI search example prompts
const AI_PROMPTS = [
  "Cozy date night spot",
  "Kid-friendly with outdoor seating",
  "Late night food that's not fast food",
  "Hidden gem with great brunch",
  "Quiet place for business lunch",
];

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { isTablet, isLandscape } = useResponsive();
  const { width } = useWindowDimensions();
  
  // Responsive columns for tablet
  const numColumns = isTablet ? (isLandscape ? 3 : 2) : 1;
  const cardWidth = isTablet ? (width - Spacing.lg * (numColumns + 1)) / numColumns : undefined;

  const {
    preferences,
    restaurants: allRestaurants,
    getFavoriteRestaurants,
    getRestaurantsWithDistance,
    toggleFavorite,
    isFavorite,
  } = useRestaurantStorage();

  // Build taste profile from favorites so we can flag matching cards below.
  const favoriteRestaurants = useMemo(() => getFavoriteRestaurants(), [getFavoriteRestaurants]);
  const { matchesTaste, profile } = useTasteProfile(
    favoriteRestaurants,
    allRestaurants,
    { postalCode: preferences.defaultZipCode || preferences.defaultPostalCode }
  );

  const { latitude, longitude } = useLocation();
  const { settings: soundSettings } = useSoundSettings();
  const { playSound } = useAppSounds(soundSettings.soundEnabled);

  // Search modes: 'traditional' or 'ai'
  const [searchMode, setSearchMode] = useState<'traditional' | 'ai'>('traditional');
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState("all");
  const [activeCuisine, setActiveCuisine] = useState("all");
  const [activePriceFilter, setActivePriceFilter] = useState("all");
  const [activeDietaryFilters, setActiveDietaryFilters] = useState<DietaryOption[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const zipCode = preferences.defaultZipCode || preferences.defaultPostalCode || "";

  // AI Semantic Search
  const { search: aiSearch, results: aiResults, loading: aiLoading, error: aiError, clear: aiClear } = useSemanticSearch();
  const { available: aiAvailable, vectorCount } = useVectorStats();

  // Debounced AI search
  useEffect(() => {
    if (searchMode === 'ai' && searchQuery.length >= 3) {
      const timer = setTimeout(() => {
        aiSearch(searchQuery);
      }, 500);
      return () => clearTimeout(timer);
    } else if (searchMode === 'ai' && searchQuery.length < 3) {
      aiClear();
    }
  }, [searchQuery, searchMode, aiSearch, aiClear]);

  const userCoords = useMemo(() => {
    return latitude && longitude ? { lat: latitude, lon: longitude } : null;
  }, [latitude, longitude]);

  const restaurantsWithDistance = useMemo(() => {
    return getRestaurantsWithDistance(userCoords);
  }, [getRestaurantsWithDistance, userCoords]);

  // Build a map for quick lookups
  const restaurantMap = useMemo(() => {
    const map = new Map<string, Restaurant>();
    restaurantsWithDistance.forEach(r => map.set(r.id, r));
    return map;
  }, [restaurantsWithDistance]);

  // Memoize filter configuration
  const filterConfig = useMemo(() => ({
    activeQuickFilter,
    activeCuisine,
    activePriceFilter,
    activeDietaryFilters,
    searchQuery,
  }), [activeQuickFilter, activeCuisine, activePriceFilter, activeDietaryFilters, searchQuery]);

  // Traditional filtered results
  const traditionalResults = useMemo(() => {
    let results = [...restaurantsWithDistance];

    // Apply quick filter
    switch (filterConfig.activeQuickFilter) {
      case "open":
        results = results.filter((r) => isOpenNow(r.hours));
        break;
      case "specials":
        results = results.filter((r) => r.dailySpecial);
        break;
      case "culvers":
        results = results.filter((r) => r.isCulvers);
        break;
      case "nearby":
        results = results.filter((r) => (r.distance ?? 999) <= 3);
        break;
    }

    // Apply price filter
    if (filterConfig.activePriceFilter !== "all") {
      results = results.filter((r) => r.priceRange === filterConfig.activePriceFilter);
    }

    // Apply cuisine filter
    if (filterConfig.activeCuisine !== "all") {
      results = results.filter((r) => {
        const cuisine = r.cuisineType?.toLowerCase() || "";
        const filterKey = filterConfig.activeCuisine.toLowerCase();
        return cuisine.includes(filterKey) || filterKey.includes(cuisine);
      });
    }

    // Apply dietary filters
    if (filterConfig.activeDietaryFilters.length > 0) {
      results = results.filter((r) => {
        if (!r.dietaryOptions || r.dietaryOptions.length === 0) return false;
        return filterConfig.activeDietaryFilters.every((filter) => r.dietaryOptions?.includes(filter));
      });
    }

    // Apply search query (traditional text search)
    if (filterConfig.searchQuery && searchMode === 'traditional') {
      const query = filterConfig.searchQuery.toLowerCase();
      results = results.filter((r) =>
        r.name.toLowerCase().includes(query) ||
        r.address.toLowerCase().includes(query) ||
        r.cuisineType?.toLowerCase().includes(query)
      );
    }

    // Sort by distance
    return results.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
  }, [restaurantsWithDistance, filterConfig, searchMode]);

  // AI search results merged with local data
  const aiSearchResults = useMemo(() => {
    if (searchMode !== 'ai' || aiResults.length === 0) return [];
    
    return aiResults.map(result => {
      // Try to get full restaurant data from local cache
      const localData = result.restaurant || restaurantMap.get(result.id);
      return {
        ...result,
        restaurant: localData || {
          id: result.id,
          name: result.metadata?.name || 'Unknown',
          cuisineType: result.metadata?.cuisineType || 'Restaurant',
          address: result.metadata?.city || '',
          priceRange: result.metadata?.priceRange,
        } as Restaurant,
      };
    });
  }, [aiResults, searchMode, restaurantMap]);

  // Final display results
  const displayResults = useMemo(() => {
    if (searchMode === 'ai' && searchQuery.length >= 3) {
      return aiSearchResults.map(r => r.restaurant).filter(Boolean) as Restaurant[];
    }
    return traditionalResults;
  }, [searchMode, searchQuery, aiSearchResults, traditionalResults]);

  const handleSearchModeToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSearchMode(prev => prev === 'traditional' ? 'ai' : 'traditional');
    setSearchQuery("");
    aiClear();
  }, [aiClear]);

  const handleAIPromptPress = useCallback((prompt: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchQuery(prompt);
  }, []);

  const handleQuickFilterPress = useCallback((filterKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveQuickFilter(filterKey);
  }, []);

  const handleCuisinePress = useCallback((cuisineKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveCuisine(cuisineKey);
  }, []);

  const handlePriceFilterPress = useCallback((priceKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePriceFilter(priceKey);
  }, []);

  const handleDietaryFilterPress = useCallback((dietary: DietaryOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveDietaryFilters((prev) => {
      if (prev.includes(dietary)) {
        return prev.filter((d) => d !== dietary);
      } else {
        return [...prev, dietary];
      }
    });
  }, []);

  const clearFilters = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveQuickFilter("all");
    setActiveCuisine("all");
    setActivePriceFilter("all");
    setActiveDietaryFilters([]);
    setSearchQuery("");
    aiClear();
  }, [aiClear]);

  const hasActiveFilters = activeQuickFilter !== "all" || activeCuisine !== "all" || activePriceFilter !== "all" || activeDietaryFilters.length > 0 || searchQuery.length > 0;

  const renderRestaurant = useCallback(({ item, index }: { item: Restaurant; index: number }) => {
    // Show AI relevance score if in AI mode
    const aiResult = searchMode === 'ai' ? aiSearchResults[index] : null;
    const relevanceScore = aiResult?.score;

    // Only flag taste matches for restaurants that aren't already favorites
    // and aren't in the user's home locale — highlight discovery, not
    // what they already love.
    const isTasteMatch =
      profile.sampleSize >= 2 &&
      !isFavorite(item.id) &&
      matchesTaste(item);

    return (
      <View style={cardWidth ? { width: cardWidth, paddingHorizontal: Spacing.xs } : undefined}>
        {relevanceScore !== undefined && (
          <View style={[styles.relevanceBadge, { backgroundColor: colors.accent }]}>
            <ThemedText style={styles.relevanceText}>
              {Math.round(relevanceScore * 100)}% match
            </ThemedText>
          </View>
        )}
        <RestaurantCard
          restaurant={item}
          onFavoritePress={() => { playSound("favorite"); toggleFavorite(item.id); }}
          isFavorite={isFavorite(item.id)}
          showDistance={true}
          tasteMatch={isTasteMatch}
        />
      </View>
    );
  }, [toggleFavorite, isFavorite, cardWidth, searchMode, aiSearchResults, colors.accent, playSound, profile.sampleSize, matchesTaste]);

  const keyExtractor = useCallback((item: Restaurant) => item.id, []);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>
            Browse
          </ThemedText>
          {hasActiveFilters && (
            <Pressable
              onPress={clearFilters}
              focusable
              accessibilityRole="button"
              style={({ pressed }: { pressed: boolean }) => [
                styles.clearButton,
                { opacity: pressed ? 0.85 : 1 },

              ]}
            >
              <ThemedText style={[styles.clearButtonText, { color: colors.accent }]}>
                Clear All
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* Search Mode Toggle */}
        <View style={styles.searchModeRow}>
          <Pressable
            onPress={handleSearchModeToggle}
            focusable
            accessibilityRole="button"
            style={({ pressed }: { pressed: boolean }) => [
              styles.modeToggle,
              { 
                backgroundColor: searchMode === 'ai' ? AppColors.copper : colors.surface,
                borderColor: searchMode === 'ai' ? AppColors.copper : colors.border,
                opacity: pressed ? 0.9 : 1,
              },

            ]}
          >
            <IconSymbol 
              name={searchMode === 'ai' ? "brain" : "magnifyingglass"} 
              size={16} 
              color={searchMode === 'ai' ? AppColors.white : colors.text} 
            />
            <ThemedText style={[
              styles.modeToggleText,
              { color: searchMode === 'ai' ? AppColors.white : colors.text }
            ]}>
              {searchMode === 'ai' ? 'AI Search' : 'Filters'}
            </ThemedText>
          </Pressable>
          {searchMode === 'ai' && vectorCount > 0 && (
            <ThemedText style={[styles.aiStatus, { color: colors.textSecondary }]}>
              {vectorCount} restaurants indexed
            </ThemedText>
          )}
        </View>

        {/* Search Bar */}
        <View style={[
          styles.searchContainer, 
          { 
            backgroundColor: colors.surface, 
            borderColor: searchMode === 'ai' ? AppColors.copper : colors.border,
            borderWidth: searchMode === 'ai' ? 2 : 1,
          }
        ]}>
          <IconSymbol 
            name={searchMode === 'ai' ? "sparkles" : "magnifyingglass"} 
            size={20} 
            color={searchMode === 'ai' ? AppColors.copper : colors.textSecondary} 
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={searchMode === 'ai' 
              ? "Describe what you're craving..." 
              : "Search restaurants, cuisines..."}
            placeholderTextColor={colors.textSecondary}
          />
          {aiLoading && searchMode === 'ai' && (
            <ActivityIndicator size="small" color={AppColors.copper} />
          )}
          {searchQuery.length > 0 && !aiLoading && (
            <Pressable onPress={() => { setSearchQuery(""); aiClear(); }}>
              <IconSymbol name="xmark" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* AI Search Prompts */}
        {searchMode === 'ai' && searchQuery.length === 0 && (
          <View style={styles.aiPromptsSection}>
            <ThemedText style={[styles.filterLabel, { color: colors.textSecondary }]}>
              Try asking for...
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.aiPromptsScroll}
            >
              {AI_PROMPTS.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => handleAIPromptPress(prompt)}
                  focusable
                  accessibilityRole="button"
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.aiPromptChip,
                    { backgroundColor: colors.surface, borderColor: AppColors.copper, opacity: pressed ? 0.9 : 1 },

                  ]}
                >
                  <IconSymbol name="sparkles" size={12} color={AppColors.copper} />
                  <ThemedText style={[styles.aiPromptText, { color: colors.text }]}>
                    {prompt}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Traditional Filters (hidden in AI mode) */}
        {searchMode === 'traditional' && (
          <>
            {/* Filter toggle button */}
            <Pressable
              onPress={() => setFiltersExpanded(!filtersExpanded)}
              style={({ pressed }: { pressed: boolean }) => [
                styles.filterToggle,
                { backgroundColor: colors.surface, borderColor: hasActiveFilters ? colors.accent : colors.border, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <IconSymbol name="line.3.horizontal.decrease" size={16} color={hasActiveFilters ? colors.accent : colors.text} />
              <ThemedText style={{ color: hasActiveFilters ? colors.accent : colors.text, fontWeight: "600", fontSize: 14 }}>
                {filtersExpanded ? "Hide Filters" : "Show Filters"}
                {hasActiveFilters ? " •" : ""}
              </ThemedText>
              <IconSymbol name={filtersExpanded ? "chevron.up" : "chevron.down"} size={14} color={colors.textSecondary} />
            </Pressable>

            {filtersExpanded && (
            <>
            {/* Quick Filter Chips */}
            <View style={styles.filterSection}>
              <ThemedText style={[styles.filterLabel, { color: colors.textSecondary }]}>
                Quick Filters
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScrollContent}
              >
                {QUICK_FILTERS.map((filter) => (
                  <Pressable
                    key={filter.key}
                    onPress={() => handleQuickFilterPress(filter.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeQuickFilter === filter.key }}
                    accessibilityLabel={`${filter.label} filter${activeQuickFilter === filter.key ? ', selected' : ''}`}
                    focusable
                    style={({ pressed }: { pressed: boolean }) => [
                      styles.filterChip,
                      {
                        backgroundColor: activeQuickFilter === filter.key ? colors.accent : colors.surface,
                        borderColor: activeQuickFilter === filter.key ? colors.accent : colors.border,
                        opacity: pressed ? 0.9 : 1,
                      },

                    ]}
                  >
                    {filter.icon && (
                      <IconSymbol
                        name={filter.icon as any}
                        size={14}
                        color={activeQuickFilter === filter.key ? AppColors.white : colors.text}
                      />
                    )}
                    <ThemedText
                      style={[
                        styles.filterText,
                        { color: activeQuickFilter === filter.key ? AppColors.white : colors.text },
                      ]}
                    >
                      {filter.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Price Range Filters */}
            <View style={styles.filterSection}>
              <ThemedText style={[styles.filterLabel, { color: colors.textSecondary }]}>
                Price Range
              </ThemedText>
              <View style={styles.priceFilterContainer}>
                {PRICE_FILTERS.map((filter) => (
                  <Pressable
                    key={filter.key}
                    onPress={() => handlePriceFilterPress(filter.key)}
                    focusable
                    accessibilityRole="button"
                    style={({ pressed }: { pressed: boolean }) => [
                      styles.priceChip,
                      {
                        backgroundColor: activePriceFilter === filter.key ? AppColors.copper : colors.surface,
                        borderColor: activePriceFilter === filter.key ? AppColors.copper : colors.border,
                        opacity: pressed ? 0.9 : 1,
                      },

                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.priceText,
                        { color: activePriceFilter === filter.key ? AppColors.white : colors.text },
                      ]}
                    >
                      {filter.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Cuisine Type Filters */}
            <View style={styles.filterSection}>
              <ThemedText style={[styles.filterLabel, { color: colors.textSecondary }]}>
                Cuisine Type
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cuisineScrollContent}
              >
                {CUISINE_TYPES.map((cuisine) => (
                  <Pressable
                    key={cuisine.key}
                    onPress={() => handleCuisinePress(cuisine.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeCuisine === cuisine.key }}
                    accessibilityLabel={`${cuisine.label} cuisine filter${activeCuisine === cuisine.key ? ', selected' : ''}`}
                    focusable
                    style={({ pressed }: { pressed: boolean }) => [
                      styles.cuisineChip,
                      {
                        backgroundColor: activeCuisine === cuisine.key ? colors.accent : colors.surface,
                        borderColor: activeCuisine === cuisine.key ? colors.accent : colors.border,
                        opacity: pressed ? 0.9 : 1,
                      },

                    ]}
                  >
                    <ThemedText style={styles.cuisineEmoji}>{cuisine.emoji}</ThemedText>
                    <ThemedText
                      style={[
                        styles.cuisineText,
                        { color: activeCuisine === cuisine.key ? AppColors.white : colors.text },
                      ]}
                    >
                      {cuisine.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Dietary Restriction Filters */}
            <View style={styles.filterSection}>
              <ThemedText style={[styles.filterLabel, { color: colors.textSecondary }]}>
                Dietary Options
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dietaryScrollContent}
              >
                {DIETARY_OPTIONS.map((dietary) => (
                  <Pressable
                    key={dietary.value}
                    onPress={() => handleDietaryFilterPress(dietary.value)}
                    focusable
                    accessibilityRole="button"
                    style={({ pressed }: { pressed: boolean }) => [
                      styles.dietaryChip,
                      {
                        backgroundColor: activeDietaryFilters.includes(dietary.value) ? AppColors.success : colors.surface,
                        borderColor: activeDietaryFilters.includes(dietary.value) ? AppColors.success : colors.border,
                        opacity: pressed ? 0.9 : 1,
                      },

                    ]}
                  >
                    <ThemedText style={styles.dietaryEmoji}>{dietary.emoji}</ThemedText>
                    <ThemedText
                      style={[
                        styles.dietaryText,
                        { color: activeDietaryFilters.includes(dietary.value) ? AppColors.white : colors.text },
                      ]}
                    >
                      {dietary.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
              <ThemedText style={[styles.dietaryDisclaimer, { color: colors.textSecondary }]}>
                Dietary options are estimated from cuisine type and should be confirmed with the restaurant.
              </ThemedText>
            </View>
            </>
            )}
          </>
        )}

        {/* Results count */}
        <View style={styles.resultsRow}>
          <ThemedText style={[styles.resultsText, { color: colors.textSecondary }]}>
            {searchMode === 'ai' && searchQuery.length >= 3
              ? `${aiSearchResults.length} AI match${aiSearchResults.length !== 1 ? "es" : ""}`
              : `${displayResults.length} restaurant${displayResults.length !== 1 ? "s" : ""} found`
            }
          </ThemedText>
          {aiError && searchMode === 'ai' && (
            <ThemedText style={[styles.errorText, { color: AppColors.error }]}>
              {aiError}
            </ThemedText>
          )}
        </View>
      </View>

      {/* Restaurant List */}
      <FlatList
        key={numColumns}
        data={displayResults}
        renderItem={renderRestaurant}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        columnWrapperStyle={numColumns > 1 ? { justifyContent: 'flex-start', paddingHorizontal: Spacing.md } : undefined}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {aiLoading && searchMode === 'ai' ? (
              <>
                <ActivityIndicator size="large" color={AppColors.copper} />
                <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Searching with AI...
                </ThemedText>
              </>
            ) : (
              <>
                <IconSymbol 
                  name={searchMode === 'ai' ? "sparkles" : "fork.knife"} 
                  size={48} 
                  color={colors.textSecondary} 
                />
                <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {searchMode === 'ai' && searchQuery.length < 3
                    ? "Describe what you're looking for"
                    : "No restaurants found"}
                </ThemedText>
                <ThemedText style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                  {searchMode === 'ai' 
                    ? "Try phrases like 'cozy Italian' or 'late night tacos'"
                    : "Try adjusting your search or filters"}
                </ThemedText>
                {hasActiveFilters && searchMode === 'traditional' && (
                  <Pressable
                    onPress={clearFilters}
                    focusable
                    accessibilityRole="button"
                    style={({ pressed }: { pressed: boolean }) => [
                      styles.clearFiltersButton,
                      { borderColor: colors.accent, opacity: pressed ? 0.9 : 1 },

                    ]}
                  >
                    <ThemedText style={[styles.clearFiltersText, { color: colors.accent }]}>
                      Clear All Filters
                    </ThemedText>
                  </Pressable>
                )}
              </>
            )}
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 32,
  },
  clearButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  searchModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  modeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  aiStatus: {
    fontSize: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.xs,
  },
  aiPromptsSection: {
    marginBottom: Spacing.md,
  },
  aiPromptsScroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  aiPromptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  aiPromptText: {
    fontSize: 12,
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  filterSection: {
    marginBottom: Spacing.sm,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  filterScrollContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 44,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "500",
  },
  priceFilterContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  priceChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minWidth: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  priceText: {
    fontSize: 14,
    fontWeight: "600",
  },
  cuisineScrollContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  cuisineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  cuisineEmoji: {
    fontSize: 16,
  },
  cuisineText: {
    fontSize: 13,
    fontWeight: "500",
  },
  dietaryScrollContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  dietaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  dietaryEmoji: {
    fontSize: 14,
  },
  dietaryText: {
    fontSize: 12,
    fontWeight: "500",
  },
  dietaryDisclaimer: {
    fontSize: 11,
    fontStyle: "italic",
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  resultsRow: {
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  resultsText: {
    fontSize: 13,
  },
  errorText: {
    fontSize: 12,
  },
  relevanceBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  relevanceText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: "700",
  },
  listContent: {
    paddingTop: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  clearFiltersButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  clearFiltersText: {
    fontSize: 14,
    fontWeight: "600",
  },
  focusRing: {
    borderWidth: 2,
    borderColor: AppColors.copper,
    shadowColor: AppColors.copper,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
});
