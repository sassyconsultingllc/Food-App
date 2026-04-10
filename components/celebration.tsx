/**
 * Celebration Effects - Confetti & Sound
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Fireworks when the spinner lands on a restaurant!
 * Respects user sound/haptic preferences.
 */

import React, { useEffect, useCallback } from "react";
import { View, StyleSheet, Dimensions, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { AppColors } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Confetti colors
const CONFETTI_COLORS = [
  "#FF6B6B", "#4ECDC4", "#FFE66D", "#95E1D3",
  "#F38181", "#AA96DA", "#FCBAD3", "#A8D8EA",
  "#FF9F43", "#6C5CE7", "#00B894", "#FD79A8",
];

interface ConfettiPieceProps {
  index: number;
  startDelay: number;
  onComplete?: () => void;
}

function ConfettiPiece({ index, startDelay, onComplete }: ConfettiPieceProps) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const startX = Math.random() * SCREEN_WIDTH;
  const size = 8 + Math.random() * 8;
  const duration = 2000 + Math.random() * 1000;
  const swayAmount = 50 + Math.random() * 100;
  const rotationAmount = 360 + Math.random() * 720;
  
  useEffect(() => {
    // Sway left/right
    translateX.value = withDelay(
      startDelay,
      withSequence(
        withTiming(swayAmount, { duration: duration / 4 }),
        withTiming(-swayAmount, { duration: duration / 2 }),
        withTiming(0, { duration: duration / 4 })
      )
    );
    
    // Fall down
    translateY.value = withDelay(
      startDelay,
      withTiming(SCREEN_HEIGHT + 100, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );
    
    // Rotate
    rotate.value = withDelay(
      startDelay,
      withTiming(rotationAmount, { duration })
    );
    
    // Fade out at the end
    opacity.value = withDelay(
      startDelay + duration * 0.7,
      withTiming(0, { duration: duration * 0.3 }, (finished) => {
        if (finished && index === 0 && onComplete) {
          runOnJS(onComplete)();
        }
      })
    );
  }, []);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));
  
  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        animatedStyle,
        {
          left: startX,
          width: size,
          height: size * 1.5,
          backgroundColor: color,
          borderRadius: size / 4,
        },
      ]}
    />
  );
}

interface CelebrationProps {
  visible: boolean;
  onComplete?: () => void;
  hapticsEnabled?: boolean;
}

export function Celebration({ visible, onComplete, hapticsEnabled = true }: CelebrationProps) {
  // Play celebration haptic
  const playHaptic = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [hapticsEnabled]);
  
  useEffect(() => {
    if (visible) {
      playHaptic();
    }
  }, [visible, playHaptic]);
  
  if (!visible) return null;
  
  const CONFETTI_COUNT = 50;
  
  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: CONFETTI_COUNT }).map((_, index) => (
        <ConfettiPiece
          key={index}
          index={index}
          startDelay={index * 30}
          onComplete={index === 0 ? onComplete : undefined}
        />
      ))}
    </View>
  );
}

// Simpler burst effect for quick celebrations
interface BurstProps {
  visible: boolean;
  centerX?: number;
  centerY?: number;
}

export function CelebrationBurst({ visible, centerX = SCREEN_WIDTH / 2, centerY = SCREEN_HEIGHT / 2 }: BurstProps) {
  if (!visible) return null;
  
  const PARTICLE_COUNT = 20;
  
  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: PARTICLE_COUNT }).map((_, index) => (
        <BurstParticle
          key={index}
          index={index}
          centerX={centerX}
          centerY={centerY}
        />
      ))}
    </View>
  );
}

function BurstParticle({ index, centerX, centerY }: { index: number; centerX: number; centerY: number }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  
  const angle = (index / 20) * Math.PI * 2;
  const distance = 100 + Math.random() * 100;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  
  useEffect(() => {
    translateX.value = withTiming(targetX, { duration: 600, easing: Easing.out(Easing.cubic) });
    translateY.value = withTiming(targetY, { duration: 600, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1.5, { duration: 200 }),
      withTiming(0, { duration: 400 })
    );
    opacity.value = withDelay(300, withTiming(0, { duration: 300 }));
  }, []);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));
  
  return (
    <Animated.View
      style={[
        styles.burstParticle,
        animatedStyle,
        {
          left: centerX - 6,
          top: centerY - 6,
          backgroundColor: color,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    overflow: "hidden",
  },
  confettiPiece: {
    position: "absolute",
    top: 0,
  },
  burstParticle: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
