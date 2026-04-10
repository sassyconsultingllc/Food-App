/**
 * User Preferences Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Manages user preferences including default location, search radius, etc.
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFERENCES_KEY = '@foodie_finder_preferences';

export interface UserPreferences {
  defaultPostalCode: string | null;
  defaultZipCode: string | null;  // Legacy alias
  defaultCountryCode: string | null;
  defaultRadius: number;
  defaultRadiusUnit: 'miles' | 'km';
  theme: 'light' | 'dark' | 'system';
  haptics: boolean;
  celebrations: boolean;
}

const defaultPreferences: UserPreferences = {
  defaultPostalCode: null,
  defaultZipCode: null,
  defaultCountryCode: null,
  defaultRadius: 5,
  defaultRadiusUnit: 'miles',
  theme: 'system',
  haptics: true,
  celebrations: true,
};

export function usePreferences() {
  const [preferences, setPreferencesState] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  // Load preferences from storage on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferencesState({ ...defaultPreferences, ...parsed });
      }
    } catch (error) {
      console.error('[Preferences] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const savePreferences = useCallback(async (newPrefs: Partial<UserPreferences>) => {
    try {
      const updated = { ...preferences, ...newPrefs };
      // Keep zipCode in sync with postalCode
      if (newPrefs.defaultPostalCode !== undefined) {
        updated.defaultZipCode = newPrefs.defaultPostalCode;
      }
      if (newPrefs.defaultZipCode !== undefined) {
        updated.defaultPostalCode = newPrefs.defaultZipCode;
      }
      
      setPreferencesState(updated);
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('[Preferences] Failed to save:', error);
    }
  }, [preferences]);

  const resetPreferences = useCallback(async () => {
    try {
      setPreferencesState(defaultPreferences);
      await AsyncStorage.removeItem(PREFERENCES_KEY);
    } catch (error) {
      console.error('[Preferences] Failed to reset:', error);
    }
  }, []);

  return {
    preferences,
    loading,
    savePreferences,
    resetPreferences,
    setDefaultLocation: useCallback((postalCode: string, countryCode?: string) => {
      savePreferences({
        defaultPostalCode: postalCode,
        defaultZipCode: postalCode,
        defaultCountryCode: countryCode || null,
      });
    }, [savePreferences]),
    setDefaultRadius: useCallback((radius: number, unit?: 'miles' | 'km') => {
      const updates: Partial<UserPreferences> = { defaultRadius: radius };
      if (unit) updates.defaultRadiusUnit = unit;
      savePreferences(updates);
    }, [savePreferences]),
    setTheme: useCallback((theme: 'light' | 'dark' | 'system') => {
      savePreferences({ theme });
    }, [savePreferences]),
    toggleHaptics: useCallback(() => {
      savePreferences({ haptics: !preferences.haptics });
    }, [savePreferences, preferences.haptics]),
    toggleCelebrations: useCallback(() => {
      savePreferences({ celebrations: !preferences.celebrations });
    }, [savePreferences, preferences.celebrations]),
  };
}

export default usePreferences;
