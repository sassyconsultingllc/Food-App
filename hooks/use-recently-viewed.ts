/**
 * Recently Viewed Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Tracks and persists recently viewed restaurants
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Restaurant } from "@/types/restaurant";
import { logger } from "@/utils/logger";

const STORAGE_KEY = "foodie_finder_recently_viewed";
const MAX_HISTORY = 10;

interface RecentlyViewedItem {
  restaurantId: string;
  viewedAt: number;
}

export function useRecentlyViewed() {
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<RecentlyViewedItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Load recently viewed from storage
  useEffect(() => {
    const loadRecentlyViewed = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as RecentlyViewedItem[];
          setRecentlyViewedIds(parsed);
        }
      } catch (error) {
        logger.error("Error loading recently viewed:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRecentlyViewed();
  }, []);

  // Save to storage whenever history changes
  const saveToStorage = useCallback(async (items: RecentlyViewedItem[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      logger.error("Error saving recently viewed:", error);
    }
  }, []);

  // Add a restaurant to recently viewed
  const addToRecentlyViewed = useCallback((restaurantId: string) => {
    setRecentlyViewedIds((prev) => {
      // Remove if already exists
      const filtered = prev.filter((item) => item.restaurantId !== restaurantId);
      
      // Add to front of list
      const newItem: RecentlyViewedItem = {
        restaurantId,
        viewedAt: Date.now(),
      };
      
      // Keep only last MAX_HISTORY items
      const updated = [newItem, ...filtered].slice(0, MAX_HISTORY);
      
      // Save to storage
      saveToStorage(updated);
      
      return updated;
    });
  }, [saveToStorage]);

  // Clear all history
  const clearHistory = useCallback(async () => {
    setRecentlyViewedIds([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      logger.error("Error clearing recently viewed:", error);
    }
  }, []);

  // Get recently viewed restaurant IDs in order
  const getRecentlyViewedIds = useCallback((): string[] => {
    return recentlyViewedIds.map((item) => item.restaurantId);
  }, [recentlyViewedIds]);

  // Filter restaurants to get recently viewed ones in order
  const getRecentlyViewedRestaurants = useCallback(
    (allRestaurants: Restaurant[]): Restaurant[] => {
      const ids = getRecentlyViewedIds();
      const restaurantMap = new Map(allRestaurants.map((r) => [r.id, r]));
      
      return ids
        .map((id) => restaurantMap.get(id))
        .filter((r): r is Restaurant => r !== undefined);
    },
    [getRecentlyViewedIds]
  );

  return {
    recentlyViewedIds: getRecentlyViewedIds(),
    recentlyViewedCount: recentlyViewedIds.length,
    loading,
    addToRecentlyViewed,
    clearHistory,
    getRecentlyViewedRestaurants,
  };
}
