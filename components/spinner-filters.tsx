/**
 * Spinner Filters Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Filter chips for narrowing down restaurants before spinning.
 * - Open Now
 * - Cuisine Type
 * - Price Range
 * - Exclude Recently Picked
 */

import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export interface SpinnerFilters {
  openNow: boolean;
  cuisineTypes: string[];
  priceRanges: string[];
  excludeRecentDays: number; // 0 = don't exclude
  maxDistance: number | null;
}

interface SpinnerFiltersProps {
  filters: SpinnerFilters;
  onFiltersChange: (filters: SpinnerFilters) => void;
  availableCuisines: string[];
  matchCount: number;
}

export const DEFAULT_FILTERS: SpinnerFilters = {
  openNow: false,
  cuisineTypes: [],
  priceRanges: [],
  excludeRecentDays: 7, // Exclude last 7 days by default
  maxDistance: null,
};

const PRICE_OPTIONS = ["$", "$$", "$$$", "$$$$"];
const EXCLUDE_OPTIONS = [
  { label: "None", value: 0 },
  { label: "3 days", value: 3 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
];

export function SpinnerFiltersBar({
  filters,
  onFiltersChange,
  availableCuisines,
  matchCount,
}: SpinnerFiltersProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const [showFilterModal, setShowFilterModal] = useState(false);
  
  const activeFilterCount = 
    (filters.openNow ? 1 : 0) +
    filters.cuisineTypes.length +
    filters.priceRanges.length +
    (filters.excludeRecentDays > 0 ? 1 : 0) +
    (filters.maxDistance !== null ? 1 : 0);
  
  const toggleOpenNow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onFiltersChange({ ...filters, openNow: !filters.openNow });
  }, [filters, onFiltersChange]);
  
  const clearFilters = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFiltersChange(DEFAULT_FILTERS);
  }, [onFiltersChange]);
  
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Open Now - Always visible */}
        <Pressable
          onPress={toggleOpenNow}
          focusable
          accessibilityRole="button"
          style={({ pressed }: { pressed: boolean }) => [
            styles.chip,
            filters.openNow && styles.chipActive,
            { 
              backgroundColor: filters.openNow ? colors.accent : colors.surface, 
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },

          ]}
        >
          <IconSymbol 
            name="clock.fill" 
            size={14} 
            color={filters.openNow ? AppColors.white : colors.textSecondary} 
          />
          <ThemedText 
            style={[
              styles.chipText, 
              filters.openNow && styles.chipTextActive
            ]}
          >
            Open Now
          </ThemedText>
        </Pressable>
        
        {/* Exclude Recent */}
        {filters.excludeRecentDays > 0 && (
          <View style={[styles.chip, styles.chipActive, { backgroundColor: colors.accent }]}>
            <IconSymbol name="clock.arrow.circlepath" size={14} color={AppColors.white} />
            <ThemedText style={[styles.chipText, styles.chipTextActive]}>
              Skip {filters.excludeRecentDays}d
            </ThemedText>
          </View>
        )}
        
        {/* Active cuisine filters */}
        {filters.cuisineTypes.map((cuisine) => (
          <View 
            key={cuisine} 
            style={[styles.chip, styles.chipActive, { backgroundColor: colors.accent }]}
          >
            <ThemedText style={[styles.chipText, styles.chipTextActive]}>
              {cuisine}
            </ThemedText>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onFiltersChange({
                  ...filters,
                  cuisineTypes: filters.cuisineTypes.filter(c => c !== cuisine),
                });
              }}
              focusable
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }: { pressed: boolean }) => [
                pressed && styles.chipPressed,

              ]}
            >
              <IconSymbol name="xmark" size={12} color={AppColors.white} />
            </Pressable>
          </View>
        ))}
        
        {/* Active price filters */}
        {filters.priceRanges.length > 0 && (
          <View style={[styles.chip, styles.chipActive, { backgroundColor: colors.accent }]}>
            <ThemedText style={[styles.chipText, styles.chipTextActive]}>
              {filters.priceRanges.join(", ")}
            </ThemedText>
          </View>
        )}
        
        {/* More Filters Button */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowFilterModal(true);
          }}
          focusable
          accessibilityRole="button"
          style={({ pressed }: { pressed: boolean }) => [
            styles.chip,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },

          ]}
        >
          <IconSymbol name="slider.horizontal.3" size={14} color={colors.textSecondary} />
          <ThemedText style={styles.chipText}>Filters</ThemedText>
          {activeFilterCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <ThemedText style={styles.badgeText}>{activeFilterCount}</ThemedText>
            </View>
          )}
        </Pressable>
        
        {/* Clear All */}
        {activeFilterCount > 0 && (
          <Pressable
            onPress={clearFilters}
            focusable
            accessibilityRole="button"
            style={({ pressed }: { pressed: boolean }) => [
              styles.chip,
              { backgroundColor: colors.error + "20", borderColor: colors.error, opacity: pressed ? 0.9 : 1 },

            ]}
          >
            <IconSymbol name="xmark.circle.fill" size={14} color={colors.error} />
            <ThemedText style={[styles.chipText, { color: colors.error }]}>Clear</ThemedText>
          </Pressable>
        )}
      </ScrollView>
      
      {/* Match count */}
      <View style={[styles.matchCount, { backgroundColor: colors.surface }]}>
        <ThemedText style={[styles.matchText, { color: colors.textSecondary }]}>
          {matchCount} match{matchCount !== 1 ? "es" : ""}
        </ThemedText>
      </View>
      
      {/* Filter Modal */}
      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filters={filters}
        onFiltersChange={onFiltersChange}
        availableCuisines={availableCuisines}
      />
    </View>
  );
}

// Full filter modal
function FilterModal({
  visible,
  onClose,
  filters,
  onFiltersChange,
  availableCuisines,
}: {
  visible: boolean;
  onClose: () => void;
  filters: SpinnerFilters;
  onFiltersChange: (filters: SpinnerFilters) => void;
  availableCuisines: string[];
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  
  const toggleCuisine = (cuisine: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newCuisines = filters.cuisineTypes.includes(cuisine)
      ? filters.cuisineTypes.filter(c => c !== cuisine)
      : [...filters.cuisineTypes, cuisine];
    onFiltersChange({ ...filters, cuisineTypes: newCuisines });
  };
  
  const togglePrice = (price: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPrices = filters.priceRanges.includes(price)
      ? filters.priceRanges.filter(p => p !== price)
      : [...filters.priceRanges, price];
    onFiltersChange({ ...filters, priceRanges: newPrices });
  };
  
  const setExcludeDays = (days: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onFiltersChange({ ...filters, excludeRecentDays: days });
  };
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.modalContainer}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <ThemedText type="subtitle">Filters</ThemedText>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            focusable
            accessibilityRole="button"
            style={undefined}
          >
            <IconSymbol name="xmark.circle.fill" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>
        
        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {/* Open Now */}
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Availability
            </ThemedText>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onFiltersChange({ ...filters, openNow: !filters.openNow });
              }}
              focusable
              accessibilityRole="button"
              style={({ pressed }: { pressed: boolean }) => [
                styles.toggleRow,
                { backgroundColor: colors.surface, opacity: pressed ? 0.9 : 1 },

              ]}
            >
              <View style={styles.toggleLeft}>
                <IconSymbol name="clock.fill" size={20} color={colors.accent} />
                <ThemedText>Open Now</ThemedText>
              </View>
              <View style={[
                styles.toggle,
                filters.openNow && styles.toggleActive,
                { backgroundColor: filters.openNow ? colors.accent : colors.border }
              ]}>
                <View style={[
                  styles.toggleKnob,
                  filters.openNow && styles.toggleKnobActive,
                ]} />
              </View>
            </Pressable>
          </View>
          
          {/* Exclude Recent */}
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Exclude Recently Picked
            </ThemedText>
            <ThemedText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Skip restaurants you've spun recently
            </ThemedText>
            <View style={styles.optionGrid}>
              {EXCLUDE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setExcludeDays(option.value)}
                  focusable
                  accessibilityRole="button"
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.optionButton,
                    filters.excludeRecentDays === option.value && styles.optionButtonActive,
                    { 
                      backgroundColor: filters.excludeRecentDays === option.value 
                        ? colors.accent 
                        : colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },

                  ]}
                >
                  <ThemedText style={[
                    styles.optionText,
                    filters.excludeRecentDays === option.value && styles.optionTextActive,
                  ]}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
          
          {/* Price Range */}
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Price Range
            </ThemedText>
            <View style={styles.optionGrid}>
              {PRICE_OPTIONS.map((price) => (
                <Pressable
                  key={price}
                  onPress={() => togglePrice(price)}
                  focusable
                  accessibilityRole="button"
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.optionButton,
                    filters.priceRanges.includes(price) && styles.optionButtonActive,
                    { 
                      backgroundColor: filters.priceRanges.includes(price) 
                        ? colors.accent 
                        : colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },

                  ]}
                >
                  <ThemedText style={[
                    styles.optionText,
                    filters.priceRanges.includes(price) && styles.optionTextActive,
                  ]}>
                    {price}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
          
          {/* Cuisine Types */}
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Cuisine Type
            </ThemedText>
            <View style={styles.cuisineGrid}>
              {availableCuisines.map((cuisine) => (
                <Pressable
                  key={cuisine}
                  onPress={() => toggleCuisine(cuisine)}
                  focusable
                  accessibilityRole="button"
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.cuisineChip,
                    filters.cuisineTypes.includes(cuisine) && styles.cuisineChipActive,
                    { 
                      backgroundColor: filters.cuisineTypes.includes(cuisine) 
                        ? colors.accent 
                        : colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },

                  ]}
                >
                  <ThemedText style={[
                    styles.cuisineText,
                    filters.cuisineTypes.includes(cuisine) && styles.cuisineTextActive,
                  ]}>
                    {cuisine}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
        
        {/* Done Button */}
        <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={onClose}
            focusable
            accessibilityRole="button"
            style={({ pressed }: { pressed: boolean }) => [
              styles.doneButton,
              { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },

            ]}
          >
            <ThemedText style={styles.doneButtonText}>Done</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipActive: {
    borderWidth: 0,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextActive: {
    color: AppColors.white,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  badgeText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
    includeFontPadding: false,
  },
  chipPressed: {
    opacity: 0.85,
  },
  matchCount: {
    alignSelf: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: 0,
    marginBottom: 0,
  },
  matchText: {
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  modalFooter: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  section: {
    paddingVertical: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: Spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
  },
  toggleActive: {},
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: AppColors.white,
  },
  toggleKnobActive: {
    transform: [{ translateX: 22 }],
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  optionButtonActive: {
    borderWidth: 0,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "500",
  },
  optionTextActive: {
    color: AppColors.white,
  },
  cuisineGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  cuisineChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  cuisineChipActive: {
    borderWidth: 0,
  },
  cuisineText: {
    fontSize: 13,
  },
  cuisineTextActive: {
    color: AppColors.white,
  },
  doneButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  doneButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  focusRing: {
    borderWidth: 2,
    borderColor: AppColors.copper,
    shadowColor: AppColors.copper,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
