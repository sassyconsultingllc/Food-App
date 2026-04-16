/**
 * Sound Settings Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Manage sound and haptic feedback preferences
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback } from "react";
import * as Haptics from "expo-haptics";

const STORAGE_KEY = "foodie_finder_sound_settings";

export interface SoundSettings {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  celebrationEnabled: boolean;
}

const DEFAULT_SETTINGS: SoundSettings = {
  soundEnabled: true,
  hapticsEnabled: true,
  celebrationEnabled: true,
};

export function useSoundSettings() {
  const [settings, setSettings] = useState<SoundSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
        }
      } catch (error) {
        console.error("Error loading sound settings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Save settings. Functional setState so rapid toggles (sound then
  // haptics) don't clobber each other via a stale `settings` closure.
  const updateSettings = useCallback(async (newSettings: Partial<SoundSettings>) => {
    try {
      let persisted: SoundSettings | null = null;
      setSettings((prev) => {
        const next = { ...prev, ...newSettings };
        persisted = next;
        return next;
      });
      if (persisted) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      }
    } catch (error) {
      console.error("Error saving sound settings:", error);
    }
  }, []);

  // Toggle sound
  const toggleSound = useCallback(() => {
    updateSettings({ soundEnabled: !settings.soundEnabled });
  }, [settings.soundEnabled, updateSettings]);

  // Toggle haptics
  const toggleHaptics = useCallback(() => {
    updateSettings({ hapticsEnabled: !settings.hapticsEnabled });
  }, [settings.hapticsEnabled, updateSettings]);

  // Toggle celebration effects
  const toggleCelebration = useCallback(() => {
    updateSettings({ celebrationEnabled: !settings.celebrationEnabled });
  }, [settings.celebrationEnabled, updateSettings]);

  // Haptic feedback (respects settings)
  const haptic = useCallback((style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(style);
    }
  }, [settings.hapticsEnabled]);

  // Notification haptic (respects settings)
  const hapticNotification = useCallback((type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
    if (settings.hapticsEnabled) {
      Haptics.notificationAsync(type);
    }
  }, [settings.hapticsEnabled]);

  return {
    settings,
    loading,
    updateSettings,
    toggleSound,
    toggleHaptics,
    toggleCelebration,
    haptic,
    hapticNotification,
  };
}
