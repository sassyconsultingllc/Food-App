/**
 * Color Scheme Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Returns the effective color scheme based on user preference or system setting
 */

import { useTheme } from "@/contexts/theme-context";
import { useColorScheme as useSystemColorScheme } from "react-native";

/**
 * Returns the effective color scheme respecting user's theme preference.
 * Uses ThemeContext which supports: light, dark, or system (follows device).
 */
export function useColorScheme(): "light" | "dark" {
  try {
    const { effectiveTheme } = useTheme();
    return effectiveTheme;
  } catch {
    // Fallback if used outside ThemeProvider (shouldn't happen in normal use)
    const systemColorScheme = useSystemColorScheme();
    return systemColorScheme ?? "light";
  }
}

// Export system hook for cases where raw system value is needed
export { useColorScheme as useSystemColorScheme } from "react-native";
