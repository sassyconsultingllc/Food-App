/**
 * Spinner Wheel Component — Edge-on Reel Style
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Wheel of Fortune-style vertical reel. Restaurant names scroll
 * past a viewport window, decelerate dramatically, and land on
 * a winner. Large text, 3-D perspective for the older crowd.
 */

import React, { useCallback, useMemo } from "react";
import { View, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "./themed-text";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppSounds } from "@/hooks/use-app-sounds";
import { useSoundSettings } from "@/hooks/use-sound-settings";
import { Restaurant } from "@/types/restaurant";

// Alternating segment accent colors (left border stripe)
const SEGMENT_ACCENTS = [
  AppColors.copper,
  "#4ECDC4",
  "#FF9F43",
  "#6C5CE7",
  "#00B894",
  "#FF6B6B",
  "#AA96DA",
  "#A8D8EA",
  "#F38181",
  "#95E1D3",
  "#FFE66D",
  "#FD79A8",
];

/** Height of each restaurant "slot" on the reel. */
const SLOT_HEIGHT = 72;
/** How many slots are visible in the viewport. */
const VISIBLE_SLOTS = 5;
/** The viewport height. */
const VIEWPORT_HEIGHT = SLOT_HEIGHT * VISIBLE_SLOTS;

interface SpinnerWheelProps {
  restaurants: Restaurant[];
  onSpinComplete: (restaurant: Restaurant) => void;
  isSpinning: boolean;
  onSpinStart: () => void;
  disabled?: boolean;
  maxSize?: number;
}

export function SpinnerWheel({
  restaurants,
  onSpinComplete,
  isSpinning,
  onSpinStart,
  disabled = false,
}: SpinnerWheelProps) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const REEL_WIDTH = Math.min(SCREEN_WIDTH - 32, 500);
  const { settings: soundSettings } = useSoundSettings();
  const { playSound } = useAppSounds(soundSettings.soundEnabled);

  const scrollY = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  // Build a long repeating reel so the scroll can wrap around
  const displayRestaurants = useMemo(
    () => restaurants.slice(0, 20),
    [restaurants],
  );

  // Repeat the list enough times so we can scroll through many "laps"
  const LAPS = 8;
  const reelItems = useMemo(() => {
    if (displayRestaurants.length === 0) return [];
    const items: { restaurant: Restaurant; accent: string }[] = [];
    for (let lap = 0; lap < LAPS; lap++) {
      displayRestaurants.forEach((r, i) => {
        items.push({ restaurant: r, accent: SEGMENT_ACCENTS[i % SEGMENT_ACCENTS.length] });
      });
    }
    return items;
  }, [displayRestaurants]);

  const totalHeight = reelItems.length * SLOT_HEIGHT;

  const handleSpin = useCallback(() => {
    if (isSpinning || disabled || displayRestaurants.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound("wheelSpin");
    onSpinStart();

    // Pick random winner
    const winnerIndex = Math.floor(Math.random() * displayRestaurants.length);
    const winner = displayRestaurants[winnerIndex];

    // Scroll through several full laps then land on the winner
    // The center slot index in the viewport: floor(VISIBLE_SLOTS / 2)
    const centerOffset = Math.floor(VISIBLE_SLOTS / 2) * SLOT_HEIGHT;
    const fullLapsScroll = (LAPS - 2) * displayRestaurants.length * SLOT_HEIGHT;
    const winnerScrollPos = winnerIndex * SLOT_HEIGHT;
    const finalScroll = fullLapsScroll + winnerScrollPos - centerOffset;

    // Glow on spin
    glowOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(0.3, { duration: 3000 }),
      withTiming(0, { duration: 800 }),
    );

    // Main scroll animation — fast start, dramatic slowdown
    scrollY.value = withTiming(
      finalScroll,
      {
        duration: 4500,
        easing: Easing.bezier(0.15, 0.85, 0.25, 1),
      },
      (finished) => {
        if (finished) {
          runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
          runOnJS(onSpinComplete)(winner);
        }
      },
    );

    // Tick haptics during spin
    let tickCount = 0;
    const maxTicks = 40;
    const tickHaptic = () => {
      if (tickCount < maxTicks) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        tickCount++;
        setTimeout(tickHaptic, 90 + tickCount * 2);
      }
    };
    tickHaptic();
  }, [isSpinning, disabled, displayRestaurants, scrollY, glowOpacity, onSpinStart, onSpinComplete]);

  // Animated reel position
  const animatedReelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value }],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  if (displayRestaurants.length === 0) {
    return (
      <View style={[styles.container, { width: REEL_WIDTH }]}>
        <View style={[styles.emptyReel, { height: VIEWPORT_HEIGHT, backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <IconSymbol name="fork.knife" size={48} color={AppColors.slateGray} />
          <ThemedText style={styles.emptyText}>Add restaurants to spin!</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: REEL_WIDTH }]}>
      {/* SPIN Button — above the reel */}
      <Pressable
        onPress={handleSpin}
        disabled={isSpinning || disabled}
        accessibilityRole="button"
        accessibilityLabel="Spin to pick a random restaurant"
        style={({ pressed }) => [
          styles.spinButton,
          { backgroundColor: isSpinning ? AppColors.slateGray : AppColors.copper },
          pressed && !isSpinning && styles.spinButtonPressed,
        ]}
      >
        <IconSymbol name="shuffle" size={22} color={AppColors.white} />
        <ThemedText style={styles.spinButtonText}>
          {isSpinning ? "Spinning…" : `SPIN (${displayRestaurants.length})`}
        </ThemedText>
      </Pressable>

      {/* Viewport frame */}
      <View style={[styles.viewport, { height: VIEWPORT_HEIGHT, borderColor: colors.border }]}>
        {/* Top/bottom fade overlays for 3-D curve effect */}
        <View style={[styles.fadeOverlayTop, { height: SLOT_HEIGHT * 1.5 }]} pointerEvents="none" />
        <View style={[styles.fadeOverlayBottom, { height: SLOT_HEIGHT * 1.5 }]} pointerEvents="none" />

        {/* Center selection highlight */}
        <View
          style={[
            styles.selectionHighlight,
            {
              top: Math.floor(VISIBLE_SLOTS / 2) * SLOT_HEIGHT,
              height: SLOT_HEIGHT,
              backgroundColor: AppColors.copper + "18",
              borderColor: AppColors.copper,
            },
          ]}
          pointerEvents="none"
        />

        {/* Left pointer arrow */}
        <View
          style={[
            styles.pointerArrow,
            { top: Math.floor(VISIBLE_SLOTS / 2) * SLOT_HEIGHT + SLOT_HEIGHT / 2 - 10 },
          ]}
          pointerEvents="none"
        >
          <View style={styles.pointerTriangle} />
        </View>

        {/* Right pointer arrow */}
        <View
          style={[
            styles.pointerArrowRight,
            { top: Math.floor(VISIBLE_SLOTS / 2) * SLOT_HEIGHT + SLOT_HEIGHT / 2 - 10 },
          ]}
          pointerEvents="none"
        >
          <View style={styles.pointerTriangleRight} />
        </View>

        {/* Glow behind selection */}
        <Animated.View
          style={[
            styles.selectionGlow,
            animatedGlowStyle,
            {
              top: Math.floor(VISIBLE_SLOTS / 2) * SLOT_HEIGHT - 4,
              height: SLOT_HEIGHT + 8,
            },
          ]}
          pointerEvents="none"
        />

        {/* The scrolling reel */}
        <Animated.View style={[styles.reel, animatedReelStyle]}>
          {reelItems.map((item, index) => (
            <ReelSlot
              key={index}
              name={item.restaurant.name}
              cuisine={item.restaurant.cuisineType}
              accent={item.accent}
              height={SLOT_HEIGHT}
              colors={colors}
              index={index}
              scrollY={scrollY}
            />
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

/** Individual slot on the reel. */
function ReelSlot({
  name,
  cuisine,
  accent,
  height,
  colors,
  index,
  scrollY,
}: {
  name: string;
  cuisine: string;
  accent: string;
  height: number;
  colors: any;
  index: number;
  scrollY: { value: number };
}) {
  // 3-D perspective: slots further from center are rotated and faded
  const animatedSlotStyle = useAnimatedStyle(() => {
    const slotTop = index * height;
    const centerY = scrollY.value + (Math.floor(VISIBLE_SLOTS / 2)) * height + height / 2;
    const distance = slotTop + height / 2 - centerY;
    const maxDistance = (VISIBLE_SLOTS / 2) * height;

    const rotateX = interpolate(
      distance,
      [-maxDistance, 0, maxDistance],
      [60, 0, -60],
      Extrapolation.CLAMP,
    );

    const scale = interpolate(
      Math.abs(distance),
      [0, maxDistance],
      [1, 0.75],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      Math.abs(distance),
      [0, maxDistance * 0.6, maxDistance],
      [1, 0.6, 0.2],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { perspective: 800 },
        { rotateX: `${rotateX}deg` },
        { scale },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.slot,
        {
          height,
          backgroundColor: colors.cardBackground,
          borderBottomColor: colors.border,
        },
        animatedSlotStyle,
      ]}
    >
      <View style={[styles.slotAccent, { backgroundColor: accent }]} />
      <View style={styles.slotContent}>
        <ThemedText style={styles.slotName} numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText style={[styles.slotCuisine, { color: colors.textSecondary }]} numberOfLines={1}>
          {cuisine}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    alignSelf: "center",
  },
  viewport: {
    overflow: "hidden",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    position: "relative",
    alignSelf: "stretch",
  },
  reel: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  slotAccent: {
    width: 5,
    height: "100%",
  },
  slotContent: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    justifyContent: "center",
  },
  slotName: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  slotCuisine: {
    fontSize: 14,
    marginTop: 2,
  },
  selectionHighlight: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    zIndex: 5,
  },
  selectionGlow: {
    position: "absolute",
    left: -2,
    right: -2,
    backgroundColor: AppColors.copper,
    borderRadius: BorderRadius.sm,
    zIndex: 4,
  },
  pointerArrow: {
    position: "absolute",
    left: -2,
    zIndex: 10,
  },
  pointerTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 14,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: AppColors.copper,
  },
  pointerArrowRight: {
    position: "absolute",
    right: -2,
    zIndex: 10,
  },
  pointerTriangleRight: {
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderRightWidth: 14,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: AppColors.copper,
  },
  fadeOverlayTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    // Using a gradient would be ideal; this is a semi-transparent overlay
    backgroundColor: "rgba(0,0,0,0.06)",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  fadeOverlayBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  spinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl * 2,
    borderRadius: BorderRadius.full,
    shadowColor: AppColors.copper,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  spinButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  spinButtonText: {
    color: AppColors.white,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  countText: {
    marginBottom: 2,
    fontSize: 13,
  },
  emptyReel: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
  },
  emptyText: {
    color: AppColors.slateGray,
    fontSize: 16,
  },
});
