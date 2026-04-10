/**
 * Quick Spin Widget / Floating Action Button
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * A floating button that provides quick access to spin functionality.
 * Can also show Culver's FOTD at a glance.
 */

import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Restaurant } from "@/types/restaurant";

interface QuickSpinWidgetProps {
  restaurants: Restaurant[];
  onRestaurantSelected: (restaurant: Restaurant) => void;
  culversFlavor?: string;
}

export function QuickSpinWidget({
  restaurants,
  onRestaurantSelected,
  culversFlavor,
}: QuickSpinWidgetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  
  const buttonScale = useSharedValue(1);
  const rotation = useSharedValue(0);
  
  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: buttonScale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));
  
  const handleQuickSpin = useCallback(() => {
    if (restaurants.length === 0) return;
    
    setIsSpinning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Animate button
    buttonScale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withSpring(1.2),
      withSpring(1)
    );
    
    rotation.value = withSequence(
      withTiming(360, { duration: 500 }),
      withTiming(720, { duration: 500 }),
      withTiming(0, { duration: 0 })
    );
    
    // Select random after animation
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * restaurants.length);
      const selected = restaurants[randomIndex];
      setIsSpinning(false);
      onRestaurantSelected(selected);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1000);
  }, [restaurants, onRestaurantSelected, buttonScale, rotation]);
  
  const toggleExpanded = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
  };
  
  return (
    <View style={styles.container}>
      {/* Expanded Menu */}
      {isExpanded && (
        <View style={styles.expandedMenu}>
          {/* Culver's FOTD */}
          {culversFlavor && (
            <Pressable style={[styles.menuItem, { backgroundColor: colors.cardBackground }]}>
              <View style={[styles.menuIcon, { backgroundColor: AppColors.skyBlue + "30" }]}>
                <ThemedText style={styles.menuEmoji}>🍦</ThemedText>
              </View>
              <View style={styles.menuContent}>
                <ThemedText style={[styles.menuLabel, { color: colors.textSecondary }]}>
                  Culver's Today
                </ThemedText>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>
                  {culversFlavor}
                </ThemedText>
              </View>
            </Pressable>
          )}
          
          {/* Quick Spin Button */}
          <Pressable
            onPress={handleQuickSpin}
            disabled={isSpinning}
            style={[styles.menuItem, { backgroundColor: colors.accent }]}
          >
            <View style={[styles.menuIcon, { backgroundColor: AppColors.white + "30" }]}>
              {isSpinning ? (
                <ActivityIndicator color={AppColors.white} size="small" />
              ) : (
                <IconSymbol name="shuffle" size={20} color={AppColors.white} />
              )}
            </View>
            <View style={styles.menuContent}>
              <ThemedText style={[styles.menuLabel, { color: AppColors.white + "80" }]}>
                Quick Pick
              </ThemedText>
              <ThemedText type="defaultSemiBold" style={{ color: AppColors.white }}>
                {isSpinning ? "Spinning..." : "Random Restaurant"}
              </ThemedText>
            </View>
          </Pressable>
          
          {/* Restaurant count */}
          <View style={[styles.countBadge, { backgroundColor: colors.surface }]}>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
              {restaurants.length} options available
            </ThemedText>
          </View>
        </View>
      )}
      
      {/* Main FAB */}
      <Pressable onPress={toggleExpanded}>
        <Animated.View
          style={[
            styles.fab,
            { backgroundColor: colors.accent },
            animatedButtonStyle,
          ]}
        >
          <IconSymbol 
            name={isExpanded ? "xmark" : "sparkles"} 
            size={28} 
            color={AppColors.white} 
          />
        </Animated.View>
      </Pressable>
    </View>
  );
}

// Standalone quick result card
interface QuickResultCardProps {
  restaurant: Restaurant;
  onDismiss: () => void;
  onViewDetails: () => void;
}

export function QuickResultCard({
  restaurant,
  onDismiss,
  onViewDetails,
}: QuickResultCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  
  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={[styles.resultCard, { backgroundColor: colors.cardBackground }]}>
          <View style={styles.resultHeader}>
            <View style={[styles.resultBadge, { backgroundColor: colors.accent + "20" }]}>
              <IconSymbol name="star.fill" size={16} color={colors.accent} />
              <ThemedText style={[styles.resultBadgeText, { color: colors.accent }]}>
                Quick Pick!
              </ThemedText>
            </View>
            <Pressable onPress={onDismiss} hitSlop={12}>
              <IconSymbol name="xmark.circle.fill" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          
          <View style={styles.resultContent}>
            <ThemedText type="subtitle">{restaurant.name}</ThemedText>
            <ThemedText style={{ color: colors.textSecondary }}>
              {restaurant.cuisineType}
            </ThemedText>
            <View style={styles.resultRating}>
              <IconSymbol name="star.fill" size={14} color={AppColors.copper} />
              <ThemedText style={styles.resultRatingText}>
                {restaurant.ratings.aggregated.toFixed(1)}
              </ThemedText>
              {restaurant.priceRange && (
                <ThemedText style={[styles.resultPrice, { color: colors.textSecondary }]}>
                  • {restaurant.priceRange}
                </ThemedText>
              )}
            </View>
          </View>
          
          <View style={styles.resultActions}>
            <Pressable
              onPress={onDismiss}
              style={[styles.resultButton, styles.resultButtonOutline, { borderColor: colors.border }]}
            >
              <ThemedText style={{ color: colors.textSecondary }}>Spin Again</ThemedText>
            </Pressable>
            <Pressable
              onPress={onViewDetails}
              style={[styles.resultButton, { backgroundColor: colors.accent }]}
            >
              <ThemedText style={{ color: AppColors.white }}>View Details</ThemedText>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    right: 20,
    alignItems: "flex-end",
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  expandedMenu: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    alignItems: "flex-end",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    minWidth: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  menuEmoji: {
    fontSize: 20,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  countBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  resultCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  resultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  resultBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  resultContent: {
    marginBottom: Spacing.lg,
  },
  resultRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  resultRatingText: {
    fontWeight: "600",
  },
  resultPrice: {},
  resultActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  resultButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  resultButtonOutline: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },
});
