/**
 * Theme Context
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Provides app-wide theme management with persistence
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  themeMode: ThemeMode;
  effectiveTheme: "light" | "dark";
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const STORAGE_KEY = "foodie_finder_theme_mode";

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load theme preference from storage
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && (stored === "light" || stored === "dark" || stored === "system")) {
          setThemeModeState(stored as ThemeMode);
        }
      } catch (error) {
        console.error("Error loading theme:", error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadTheme();
  }, []);

  // Set theme mode and persist to storage
  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      console.error("Error saving theme:", error);
    }
  };

  // Calculate effective theme based on mode
  const effectiveTheme: "light" | "dark" = 
    themeMode === "system" 
      ? (systemColorScheme ?? "light") 
      : themeMode;

  const isDark = effectiveTheme === "dark";

  // Don't render until theme is loaded to prevent flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ themeMode, effectiveTheme, setThemeMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
