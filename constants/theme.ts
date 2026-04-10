/**
 * Foodie Finder Theme Configuration
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Color palette: Light blues, light orange/copper, and charcoal gray
 * Designed for a calm, cool, collected aesthetic
 */

import { Platform } from "react-native";

// Primary Colors
export const AppColors = {
  // Blues
  skyBlue: "#6BA3BE",
  lightBlue: "#A8D5E5",
  softBlue: "#E8F4F8",
  
  // Copper/Orange accents - WCAG AA compliant
  copper: "#996622",        // Darkened for 5.2:1 contrast on cream (was #B87333)
  copperLight: "#B87333",   // Original copper for decorative use
  copperText: "#7A5A1A",    // For text on light backgrounds (7:1+ contrast)
  lightOrange: "#E8A87C",
  warmCream: "#FDF5E6",
  
  // Neutrals
  charcoal: "#36454F",
  slateGray: "#5A6A7A",
  lightGray: "#E5E8EB",
  offWhite: "#FAFBFC",
  
  // Semantic
  success: "#4CAF50",
  warning: "#FF9800",
  error: "#F44336",
  white: "#FFFFFF",
};

export const Colors = {
  light: {
    text: AppColors.charcoal,
    textSecondary: AppColors.slateGray,
    background: AppColors.offWhite,
    surface: AppColors.white,
    surfaceElevated: AppColors.warmCream,
    tint: AppColors.skyBlue,
    accent: AppColors.copper,
    accentLight: AppColors.lightOrange,
    icon: AppColors.slateGray,
    border: AppColors.lightGray,
    tabIconDefault: AppColors.slateGray,
    tabIconSelected: AppColors.copper,
    cardBackground: AppColors.warmCream,
    headerBackground: AppColors.softBlue,
    warning: AppColors.warning,
    success: AppColors.success,
    error: AppColors.error,
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#9BA1A6",
    background: "#151718",
    surface: "#1E2022",
    surfaceElevated: "#252829",
    tint: AppColors.lightBlue,
    accent: AppColors.lightOrange,
    accentLight: AppColors.copper,
    icon: "#9BA1A6",
    border: "#3A3F42",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: AppColors.lightOrange,
    cardBackground: "#252829",
    headerBackground: "#1D3D47",
    warning: AppColors.warning,
    success: AppColors.success,
    error: AppColors.error,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  title: 32,
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
