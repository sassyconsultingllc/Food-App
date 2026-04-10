/**
 * Color Scheme Hook (Web)
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Returns the effective color scheme respecting user's theme preference.
 * Web-specific version handles hydration for static rendering.
 */

import { useEffect, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import { useTheme } from "@/contexts/theme-context";

export function useColorScheme(): "light" | "dark" {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Try to use ThemeContext for user preference
  try {
    const { effectiveTheme } = useTheme();
    if (hasHydrated) {
      return effectiveTheme;
    }
    return "light"; // Default during SSR
  } catch {
    // Fallback if used outside ThemeProvider
    const systemColorScheme = useSystemColorScheme();
    if (hasHydrated) {
      return systemColorScheme ?? "light";
    }
    return "light";
  }
}
