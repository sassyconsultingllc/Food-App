// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-FNWKVZK7P753
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
