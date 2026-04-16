/**
 * Color Scheme Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Returns the effective color scheme based on user preference or system setting.
 *
 * IMPORTANT: all hooks must be called unconditionally at the top level.
 * Previously useSystemColorScheme was inside a catch block, violating
 * Rules of Hooks and risking a crash on re-renders where the try/catch
 * path changed.
 */

import { useTheme } from "@/contexts/theme-context";
import { useColorScheme as useSystemColorScheme } from "react-native";

export function useColorScheme(): "light" | "dark" {
  // Call both hooks unconditionally so call order is stable.
  const systemColorScheme = useSystemColorScheme();
  let effectiveTheme: "light" | "dark" | undefined;
  try {
    ({ effectiveTheme } = useTheme());
  } catch {
    // Outside ThemeProvider — fall through to system value
  }
  return effectiveTheme ?? systemColorScheme ?? "light";
}

// Export system hook for cases where raw system value is needed
export { useColorScheme as useSystemColorScheme } from "react-native";
