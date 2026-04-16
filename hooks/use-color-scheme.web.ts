/**
 * Color Scheme Hook (Web)
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Web-specific version handles hydration for static rendering.
 * All hooks called unconditionally to satisfy Rules of Hooks.
 */

import { useEffect, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import { useTheme } from "@/contexts/theme-context";

export function useColorScheme(): "light" | "dark" {
  const [hasHydrated, setHasHydrated] = useState(false);
  const systemColorScheme = useSystemColorScheme();

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  let effectiveTheme: "light" | "dark" | undefined;
  try {
    ({ effectiveTheme } = useTheme());
  } catch {
    // Outside ThemeProvider
  }

  if (!hasHydrated) return "light";
  return effectiveTheme ?? systemColorScheme ?? "light";
}
