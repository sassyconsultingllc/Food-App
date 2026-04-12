/**
 * Home Screen - Visual Spinner with Filters
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Features:
 * - Visual spinning wheel (not just a button)
 * - Open Now filter
 * - Cuisine & Price filters
 * - Exclude recently picked
 * - Personal notes on favorites
 * - Culver's Flavor of the Day widget
 */

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SpinnerWheel } from "@/components/spinner-wheel";
import { SpinnerFiltersBar, SpinnerFilters, DEFAULT_FILTERS } from "@/components/spinner-filters";
import { Celebration } from "@/components/celebration";
import { UserProfileModal, UserAvatar } from "@/components/user-profile-modal";
import { CulversFlavorWidget } from "@/components/culvers-calendar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLocation } from "@/hooks/use-location";
import { useRestaurantStorage } from "@/hooks/use-restaurant-storage";
import { useSpinHistory } from "@/hooks/use-spin-history";
import { useSoundSettings } from "@/hooks/use-sound-settings";
import { isRestaurantOpenNow } from "@/utils/hours-utils";
import { calculateDistance, isValidPostalCode } from "@/utils/geo-utils";
import { Restaurant } from "@/types/restaurant";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const router = useRouter();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const lastPreferenceZipRef = useRef<string | null>(null);
  const lastLocationZipRef = useRef<string | null>(null);

  // Location hook
  const {
    latitude: locationLat,
    longitude: locationLon,
    loading: locationLoading,
    error: locationError,
    latitude,
    longitude,
    city,
    state: locationState,
    zipCode: locationZipCode,
    countryCode: locationCountryCode,
    getCurrentLocation,
  } = useLocation();

  // Restaurant data
  const {
    restaurants,
    preferences,
    savePreferences,
    searchWithNewParams,
  } = useRestaurantStorage();

  // Spin history for exclusion
  const {
    addToHistory,
    getRecentlyPickedIds,
  } = useSpinHistory();

  // Sound settings
  const { settings: soundSettings, toggleHaptics } = useSoundSettings();

  // State - Initialize empty, sync from preferences via effect
  const [zipCode, setZipCode] = useState("");
  const [radius, setRadius] = useState(5);
  
  // Sync local state with saved preferences and trigger initial search when available
  useEffect(() => {
    const savedZip = preferences.defaultZipCode || preferences.defaultPostalCode || "";
    const savedRadius = preferences.defaultRadius || 5;

    if (!savedZip) return;

    const preferenceZipChanged = lastPreferenceZipRef.current !== savedZip;

    if (preferenceZipChanged || !zipCode) {
      setZipCode(savedZip);
      setRadius(savedRadius);
    }

    if (preferenceZipChanged) {
      lastPreferenceZipRef.current = savedZip;
      searchWithNewParams(savedZip, savedRadius);
    }
  }, [
    preferences.defaultZipCode,
    preferences.defaultPostalCode,
    preferences.defaultRadius,
    searchWithNewParams,
    zipCode,
  ]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [filters, setFilters] = useState<SpinnerFilters>(DEFAULT_FILTERS);
  const [showCelebration, setShowCelebration] = useState(false);
  // Track the celebration timer so we can clear it on unmount and avoid
  // calling setState on a dead component.
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = null;
      }
    };
  }, []);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // React to GPS updates — only seeds the search if no saved preference zip exists
  useEffect(() => {
    if (!locationZipCode || locationZipCode.length < 2 || locationLoading) return;

    const locationZipChanged = lastLocationZipRef.current !== locationZipCode;
    if (!locationZipChanged) return;

    // Don't override a zip the user already has saved
    const hasSavedZip = !!(preferences.defaultZipCode || preferences.defaultPostalCode);
    if (hasSavedZip) return;

    lastLocationZipRef.current = locationZipCode;
    setZipCode(locationZipCode);
    setLocationName(
      city && locationState ? `${city}, ${locationState}` : locationZipCode
    );

    // Preserve the user's saved radius instead of clobbering it with the
    // local component state (which is 5 by default). Only overwrite the
    // radius if the user has no saved preference yet.
    const savedRadius = preferences.defaultRadius ?? radius;
    searchWithNewParams(locationZipCode, savedRadius);
    savePreferences({
      defaultZipCode: locationZipCode,
      defaultPostalCode: locationZipCode,
      defaultCountryCode: locationCountryCode ?? undefined,
      // Do NOT include defaultRadius here — we'd overwrite the user's
      // saved preference with whatever local state happens to hold.
    });
  }, [
    city,
    locationState,
    locationZipCode,
    locationCountryCode,
    locationLoading,
    radius,
    savePreferences,
    searchWithNewParams,
    preferences.defaultZipCode,
    preferences.defaultPostalCode,
    preferences.defaultRadius,
  ]);

  // Animation values

  // Get unique cuisines from restaurants
  const availableCuisines = useMemo(() => {
    const cuisines = new Set<string>();
    restaurants.forEach(r => {
      if (r.cuisineType) cuisines.add(r.cuisineType);
    });
    return Array.from(cuisines).sort();
  }, [restaurants]);

  // Filter restaurants based on current filters
  const filteredRestaurants = useMemo(() => {
    let filtered = [...restaurants];


    // Filter by actual distance from user's GPS coordinates
    if (locationLat && locationLon) {
      filtered = filtered.filter(r => {
        if (!r.latitude || !r.longitude) return true;
        const dist = calculateDistance(locationLat, locationLon, r.latitude, r.longitude);
        return dist <= radius;
      });
    }
    
    // Open Now filter
    if (filters.openNow) {
      filtered = filtered.filter(r => isRestaurantOpenNow(r.hours));
    }
    
    // Cuisine filter
    if (filters.cuisineTypes.length > 0) {
      filtered = filtered.filter(r => 
        filters.cuisineTypes.some(cuisine => 
          r.cuisineType?.toLowerCase().includes(cuisine.toLowerCase())
        )
      );
    }
    
    // Price filter
    if (filters.priceRanges.length > 0) {
      filtered = filtered.filter(r => 
        r.priceRange && filters.priceRanges.includes(r.priceRange)
      );
    }
    
    // Exclude recently picked
    if (filters.excludeRecentDays > 0) {
      const recentIds = getRecentlyPickedIds(filters.excludeRecentDays);
      filtered = filtered.filter(r => !recentIds.includes(r.id));
    }
    
    return filtered;
  }, [restaurants, locationLat, locationLon, radius, filters, getRecentlyPickedIds]);

  // Handle GPS location
  const handleUseMyLocation = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await getCurrentLocation();
    // Location state will update via the hook - effect below handles the search
  }, [getCurrentLocation]);

  // Handle spin start
  const handleSpinStart = useCallback(() => {
    setIsSpinning(true);
  }, []);

  // Handle spin complete
  const handleSpinComplete = useCallback((restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
    setIsSpinning(false);
    setHasSpun(true);

    // Trigger celebration! Track the timer so it can be cancelled on
    // unmount before fire (e.g. tab-switch mid-celebration).
    setShowCelebration(true);
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = setTimeout(() => {
      celebrationTimerRef.current = null;
      setShowCelebration(false);
    }, 3000);

    // Add to history
    addToHistory(restaurant.id, restaurant.name);
  }, [addToHistory]);

  const handleRadiusChange = (delta: number) => {
    const newRadius = Math.max(1, Math.min(25, radius + delta));
    setRadius(newRadius);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Trigger new search when radius changes
    if (isValidPostalCode(zipCode)) {
      searchWithNewParams(zipCode, newRadius);
    }
  };

  const handleZipCodeChange = (text: string) => {
    setZipCode(text);
    setLocationName(null);

    // Trigger search when a valid postal code is entered
    if (isValidPostalCode(text)) {
      searchWithNewParams(text, radius);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.sm }]}>
      {/* Header — compact single row */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>Foodie Finder</ThemedText>
        <UserAvatar
          displayName={preferences.displayName ?? ""}
          profilePhotoUri={preferences.profilePhotoUri}
          onPress={() => setShowProfileModal(true)}
          colors={colors}
        />
      </View>

      {/* Zip + GPS + Radius — single compact row */}
      <View style={styles.searchRow}>
        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="mappin.and.ellipse" size={18} color={colors.accent} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={zipCode}
            onChangeText={handleZipCodeChange}
            placeholder="Zip code"
            placeholderTextColor={colors.textSecondary}
            keyboardType="default"
            maxLength={10}
            autoCapitalize="characters"
          />
        </View>
        <Pressable
          onPress={handleUseMyLocation}
          disabled={locationLoading}
          accessibilityLabel="Use my current location"
          accessibilityRole="button"
          style={({ pressed }: { pressed: boolean }) => [
            styles.gpsButton,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
            locationLoading && styles.gpsButtonDisabled,
          ]}
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color={AppColors.white} />
          ) : (
            <IconSymbol name="location.fill" size={18} color={AppColors.white} />
          )}
        </Pressable>
        <View style={styles.radiusInline}>
          <Pressable
            onPress={() => handleRadiusChange(-1)}
            accessibilityLabel="Decrease search radius"
            accessibilityRole="button"
            style={({ pressed }: { pressed: boolean }) => [
              styles.radiusBtn,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <IconSymbol name="minus" size={16} color={colors.accent} />
          </Pressable>
          <ThemedText style={[styles.radiusText, { color: colors.accent }]}>
            {radius} mi
          </ThemedText>
          <Pressable
            onPress={() => handleRadiusChange(1)}
            accessibilityLabel="Increase search radius"
            accessibilityRole="button"
            style={({ pressed }: { pressed: boolean }) => [
              styles.radiusBtn,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <IconSymbol name="plus" size={16} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      {/* Location / error feedback */}
      {locationName && (
        <View style={styles.locationFeedback}>
          <IconSymbol name="checkmark.circle.fill" size={12} color={colors.success} />
          <ThemedText style={[styles.locationFeedbackText, { color: colors.success }]}>{locationName}</ThemedText>
        </View>
      )}
      {locationError && (
        <View style={styles.locationFeedback}>
          <IconSymbol name="exclamationmark.circle" size={12} color={colors.error} />
          <ThemedText style={[styles.locationFeedbackText, { color: colors.error }]}>{locationError}</ThemedText>
        </View>
      )}

      {/* Culver's Flavor of the Day (US ZIPs only; renders null otherwise) */}
      <CulversFlavorWidget zipCode={zipCode} />

      {/* Filters */}
      <SpinnerFiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        availableCuisines={availableCuisines}
        matchCount={filteredRestaurants.length}
      />

      {/* Wheel — fills remaining space */}
      <View style={styles.wheelFlex}>
        <SpinnerWheel
          restaurants={filteredRestaurants}
          onSpinComplete={handleSpinComplete}
          isSpinning={isSpinning}
          onSpinStart={handleSpinStart}
          disabled={filteredRestaurants.length === 0}
          maxSize={Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) - 120}
        />
      </View>

      {/* Result overlay after spin */}
      {selectedRestaurant && !isSpinning && (
        <View style={[styles.resultOverlay, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.resultHeader}>
            <IconSymbol name="star.fill" size={20} color={AppColors.copper} />
            <ThemedText type="defaultSemiBold" style={styles.resultTitle}>
              {selectedRestaurant.name}
            </ThemedText>
          </View>
          <ThemedText style={[styles.resultCuisine, { color: colors.textSecondary }]}>
            {selectedRestaurant.cuisineType}
            {selectedRestaurant.ratings?.aggregated ? ` · ${selectedRestaurant.ratings.aggregated.toFixed(1)}★` : ""}
          </ThemedText>
          <View style={styles.resultActions}>
            <Pressable
              onPress={() => router.push(`/restaurant/${selectedRestaurant.id}` as any)}
              accessibilityRole="button"
              style={({ pressed }: { pressed: boolean }) => [
                styles.viewButton,
                { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <ThemedText style={styles.viewButtonText}>View Details</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                setSelectedRestaurant(null);
                setHasSpun(false);
              }}
              accessibilityRole="button"
              style={({ pressed }: { pressed: boolean }) => [
                styles.dismissButton,
                { borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <IconSymbol name="arrow.counterclockwise" size={16} color={colors.accent} />
              <ThemedText style={[styles.dismissText, { color: colors.accent }]}>Again</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* No matches feedback */}
      {hasSpun && !isSpinning && !selectedRestaurant && (
        <View style={[styles.resultOverlay, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <ThemedText style={[styles.noMatchText, { color: colors.warning }]}>
            No matches — try adjusting filters or radius
          </ThemedText>
        </View>
      )}

      {/* Celebration confetti */}
      {soundSettings.celebrationEnabled && (
        <Celebration
          visible={showCelebration}
          hapticsEnabled={soundSettings.hapticsEnabled}
        />
      )}

      <UserProfileModal
        visible={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        displayName={preferences.displayName ?? ""}
        homeZip={preferences.defaultZipCode || preferences.defaultPostalCode || ""}
        profilePhotoUri={preferences.profilePhotoUri}
        onSave={(name, zip, profilePhotoUri) => {
          savePreferences({
            displayName: name,
            defaultZipCode: zip,
            defaultPostalCode: zip,
            profilePhotoUri,
          });
          if (zip && isValidPostalCode(zip)) {
            setZipCode(zip);
            searchWithNewParams(zip, radius);
          }
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: 26,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  gpsButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  gpsButtonDisabled: {
    opacity: 0.7,
  },
  radiusInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  radiusBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  radiusText: {
    fontSize: 14,
    fontWeight: "700",
    minWidth: 40,
    textAlign: "center",
  },
  locationFeedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  locationFeedbackText: {
    fontSize: 12,
  },
  wheelFlex: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  resultOverlay: {
    position: "absolute",
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  resultTitle: {
    flex: 1,
  },
  resultCuisine: {
    fontSize: 13,
    marginBottom: Spacing.sm,
  },
  resultActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  viewButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  viewButtonText: {
    color: AppColors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  dismissButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  dismissText: {
    fontWeight: "600",
    fontSize: 14,
  },
  noMatchText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
  },
});
