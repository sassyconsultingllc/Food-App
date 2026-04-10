/**
 * Share Utilities
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Utilities for sharing restaurant information
 */

import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";
import { Restaurant } from "@/types/restaurant";
import { formatDisplayAddress } from "@/utils/address-utils";
import { logger } from "@/utils/logger";
import { getOpenStatus, getTodayHours } from "@/utils/hours-utils";

/**
 * Generate shareable text for a restaurant
 */
export function generateShareText(restaurant: Restaurant): string {
  const lines: string[] = [];
  
  // Restaurant name and cuisine
  lines.push(`🍽️ ${restaurant.name}`);
  lines.push(`${restaurant.cuisineType}${restaurant.priceRange ? ` · ${restaurant.priceRange}` : ""}`);
  lines.push("");
  
  // Rating
  lines.push(`⭐ ${restaurant.ratings.aggregated.toFixed(1)} rating`);
  
  // Address
  lines.push(`📍 ${formatDisplayAddress(restaurant.address, restaurant.city, restaurant.state, restaurant.zipCode)}`);
  
  // Phone
  if (restaurant.phone) {
    lines.push(`📞 ${restaurant.phone}`);
  }
  
  // Open status
  if (restaurant.hours) {
    const status = getOpenStatus(restaurant.hours);
    const todayHours = getTodayHours(restaurant.hours);
    lines.push(`🕐 ${status.statusText}${todayHours ? ` · ${todayHours}` : ""}`);
  }
  
  // Daily special
  if (restaurant.dailySpecial) {
    lines.push("");
    lines.push(`✨ Today's Special: ${restaurant.dailySpecial.title}`);
  }
  
  // Culver's Flavor of the Day
  if (restaurant.isCulvers && restaurant.flavorOfTheDay) {
    lines.push("");
    lines.push(`🍦 Flavor of the Day: ${restaurant.flavorOfTheDay}`);
  }
  
  // Website
  if (restaurant.website) {
    lines.push("");
    lines.push(`🌐 ${restaurant.website}`);
  }
  
  // Footer
  lines.push("");
  lines.push("Found with Foodie Finder");
  lines.push("© 2025 Sassy Consulting - A Veteran Owned Company");
  
  return lines.join("\n");
}

/**
 * Share restaurant using native share sheet
 */
export async function shareRestaurant(restaurant: Restaurant): Promise<boolean> {
  const shareText = generateShareText(restaurant);
  
  try {
    // Use React Native's Share API for cross-platform support
    const result = await Share.share({
      message: shareText,
      title: `Check out ${restaurant.name}!`,
    });
    
    if (result.action === Share.sharedAction) {
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error("Error sharing restaurant:", error);
    return false;
  }
}

/**
 * Check if sharing is available on this device
 */
export async function isSharingAvailable(): Promise<boolean> {
  try {
    return await Sharing.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Generate a short share message for quick sharing
 */
export function generateQuickShareText(restaurant: Restaurant): string {
  return `Check out ${restaurant.name} (${restaurant.cuisineType}) - ⭐ ${restaurant.ratings.aggregated.toFixed(1)} | ${formatDisplayAddress(restaurant.address, restaurant.city, restaurant.state, restaurant.zipCode)}`;
}
