/**
 * Icon Symbol Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Fallback for using MaterialIcons on Android and web.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols to Material Icons mappings for Foodie Finder
 */
const MAPPING = {
  // Tab bar icons
  "house.fill": "home",
  "magnifyingglass": "search",
  "heart.fill": "favorite",
  "gearshape.fill": "settings",
  
  // Action icons
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  
  // Restaurant/Food icons
  "fork.knife": "flatware",
  "fork.knife.circle.fill": "restaurant",
  "mappin.and.ellipse": "place",
  "star.fill": "star",
  "star": "star-outline",
  "phone.fill": "phone",
  "globe": "language",
  "clock.fill": "schedule",
  
  // Utility icons
  "shuffle": "shuffle",
  "dice.fill": "casino",
  "plus": "add",
  "minus": "remove",
  "xmark": "close",
  "checkmark": "check",
  "square.and.arrow.up": "share",
  "info.circle.fill": "info",
  "exclamationmark.triangle.fill": "warning",
  
  // Special icons
  "flame.fill": "local-fire-department",
  "sparkles": "auto-awesome",
  "location.fill": "my-location",
  "checkmark.circle.fill": "check-circle",
  "photo.fill": "photo",
  "exclamationmark.circle": "error-outline",
  "chevron.up": "expand-less",
  "chevron.down": "expand-more",
  
  // Sentiment icons
  "hand.thumbsup.fill": "thumb-up",
  "hand.thumbsdown.fill": "thumb-down",
  "hand.raised.fill": "pan-tool",
  
  // Menu & Ordering icons
  "doc.text.fill": "description",
  "car.fill": "directions-car",
  
  // Theme icons
  "sun.max.fill": "light-mode",
  "moon.fill": "dark-mode",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}

export type { IconSymbolName };
