/**
 * Responsive Utility Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { useWindowDimensions } from "react-native";
import { useMemo } from "react";

export interface ResponsiveBreakpoints {
  isSmallPhone: boolean;  // < 375px (iPhone SE, small Android)
  isPhone: boolean;       // < 768px
  isTablet: boolean;      // >= 768px && < 1024px
  isDesktop: boolean;     // >= 1024px
  isLandscape: boolean;
  width: number;
  height: number;
}

export function useResponsive(): ResponsiveBreakpoints {
  const { width, height } = useWindowDimensions();
  
  return useMemo(() => ({
    isSmallPhone: width < 375,
    isPhone: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    isLandscape: width > height,
    width,
    height,
  }), [width, height]);
}

/**
 * Responsive sizing utility
 * Scales a base size relative to screen width with min/max bounds
 * @param baseSize - The base size in points (designed for 390px width)
 * @param screenWidth - Current screen width
 * @param options - Optional min, max, and scale multiplier
 */
export function responsiveSize(
  baseSize: number,
  screenWidth: number,
  options?: { min?: number; max?: number; scale?: number }
): number {
  const { min = 0, max = Infinity, scale = 1 } = options || {};
  const scaledSize = baseSize * (screenWidth / 390) * scale; // 390 = iPhone 14 baseline
  return Math.min(Math.max(scaledSize, min), max);
}

/**
 * Get responsive font size
 * @param baseSize - Base font size
 * @param screenWidth - Current screen width
 */
export function responsiveFontSize(baseSize: number, screenWidth: number): number {
  return responsiveSize(baseSize, screenWidth, { min: baseSize * 0.8, max: baseSize * 1.3 });
}
