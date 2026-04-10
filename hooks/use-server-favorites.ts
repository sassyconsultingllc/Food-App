/**
 * Server-Synced Favorites Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Manages user's favorites list stored on the server.
 * Favorites come from Google Maps shares and are used by the randomizer.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";
import { Restaurant } from "@/types/restaurant";
import { ScrapedRestaurant } from "@/server/restaurant-scraper";

const DEVICE_ID_KEY = "foodie_finder_device_id";

async function getDeviceId(): Promise<string> {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}

function transformToClientRestaurant(server: ScrapedRestaurant): Restaurant {
  return {
    id: server.id,
    name: server.name,
    cuisineType: server.cuisineType || "Restaurant",
    address: server.address || "",
    city: server.city || "",
    state: server.state || "",
    zipCode: server.zipCode || "",
    latitude: server.latitude || 0,
    longitude: server.longitude || 0,
    phone: server.phone,
    website: server.website,
    isCulvers: server.isCulvers || false,
    flavorOfTheDay: server.flavorOfTheDay,
    flavorDescription: server.flavorDescription,
    ratings: {
      aggregated: server.ratings?.aggregated || 0,
      totalReviews: server.ratings?.totalReviews || 0,
      google: server.ratings?.google,
      googleReviewCount: server.ratings?.googleReviewCount,
      foursquare: server.ratings?.foursquare,
      foursquareReviewCount: server.ratings?.foursquareReviewCount,
    },
    priceRange: server.priceRange as Restaurant["priceRange"],
    hours: server.hours as Restaurant["hours"],
    photos: server.photos,
    sentiment: server.sentiment,
    reviewSummary: server.reviewSummary,
    lastUpdated: server.scrapedAt,
    dataSources: server.sources,
  };
}

export function useServerFavorites() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Restaurant[]>([]);

  // Load device ID
  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  // Fetch favorites from server
  const favoritesQuery = trpc.restaurant.getFavorites.useQuery(
    { userId: deviceId! },
    {
      enabled: !!deviceId,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  // Remove mutation
  const removeMutation = trpc.restaurant.removeFavorite.useMutation({
    onSuccess: () => {
      favoritesQuery.refetch();
    },
  });

  // Random from favorites query
  const randomMutation = trpc.restaurant.randomFromFavorites.useQuery(
    { userId: deviceId! },
    { enabled: false } // Manual trigger only
  );

  // Transform server data to client format
  useEffect(() => {
    if (favoritesQuery.data) {
      const transformed = favoritesQuery.data.map(transformToClientRestaurant);
      setFavorites(transformed);
    }
  }, [favoritesQuery.data]);

  // Remove from favorites
  const removeFromFavorites = useCallback(async (restaurantId: number) => {
    if (!deviceId) return;
    
    await removeMutation.mutateAsync({
      userId: deviceId,
      restaurantId,
    });
  }, [deviceId, removeMutation]);

  // Get random favorite
  const getRandomFavorite = useCallback(async (cuisineType?: string): Promise<Restaurant | null> => {
    if (!deviceId || favorites.length === 0) return null;

    let pool = favorites;
    
    if (cuisineType) {
      pool = favorites.filter(r =>
        r.cuisineType.toLowerCase().includes(cuisineType.toLowerCase())
      );
    }

    if (pool.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }, [deviceId, favorites]);

  // Check if restaurant is a favorite
  const isFavorite = useCallback((restaurantId: string): boolean => {
    return favorites.some(f => f.id === restaurantId);
  }, [favorites]);

  // Get cuisine types from favorites
  const cuisineTypes = useMemo(() => {
    const types = new Set(favorites.map(r => r.cuisineType));
    return Array.from(types).sort();
  }, [favorites]);

  return {
    favorites,
    loading: favoritesQuery.isLoading,
    error: favoritesQuery.error?.message || null,
    refetch: favoritesQuery.refetch,
    removeFromFavorites,
    getRandomFavorite,
    isFavorite,
    cuisineTypes,
    count: favorites.length,
  };
}
