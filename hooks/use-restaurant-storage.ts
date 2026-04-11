/**
 * Restaurant Storage Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Manages restaurant data fetching from server and local storage for preferences
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Alert } from "react-native";

import { calculateDistance } from "@/utils/geo-utils";
import {
  Restaurant,
  UserPreferences,
  DEFAULT_PREFERENCES,
  FilterOptions,
  DietaryOption,
} from "@/types/restaurant";
import { trpc } from "@/lib/trpc";
import { useRestaurantSearchContext } from "@/context/restaurant-search-context";

const STORAGE_KEYS = {
  PREFERENCES: "foodie_finder_preferences",
  FAVORITES: "foodie_finder_favorites",
  FAVORITES_DATA: "foodie_finder_favorites_data",
  CACHED_RESTAURANTS: "foodie_finder_cached_restaurants",
  CACHE_TIMESTAMP: "foodie_finder_cache_timestamp",
  PERSONAL_NOTES: "foodie_finder_personal_notes",
};

const MAX_RETRIES = 3;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Retry an async operation with exponential backoff
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (MAX_RETRIES - retries + 1)));
      return retryOperation(operation, retries - 1);
    }
    throw error;
  }
}

export function useRestaurantStorage() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [restaurantsError, setRestaurantsError] = useState<string | null>(null);
  const [personalNotes, setPersonalNotes] = useState<Record<string, string>>({});
  const [favoritesData, setFavoritesData] = useState<Record<string, Restaurant>>({});
  const [cacheLoaded, setCacheLoaded] = useState(false);

  // Shared search params from context so all tabs stay in sync
  const { currentSearchParams, setCurrentSearchParams } = useRestaurantSearchContext();

  // Track if we've done initial sync to avoid duplicate triggers
  const initialSyncDone = useRef(false);

  // Load preferences from storage - sync search params in same effect to avoid race
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES);
        let loadedPrefs = DEFAULT_PREFERENCES;
        if (stored) {
          const parsed = JSON.parse(stored);
          loadedPrefs = { ...DEFAULT_PREFERENCES, ...parsed };
          setPreferences(loadedPrefs);
        }

        // Also load personal notes
        const notesStored = await AsyncStorage.getItem(STORAGE_KEYS.PERSONAL_NOTES);
        if (notesStored) {
          setPersonalNotes(JSON.parse(notesStored));
        }

        // Load favorites data (full restaurant snapshots, independent of search cache)
        const favoritesStored = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES_DATA);
        if (favoritesStored) {
          try {
            const parsedFavorites: Record<string, Restaurant> = JSON.parse(favoritesStored);
            setFavoritesData(parsedFavorites);
            // Reconcile: preferences.favorites should match the keys of favoritesData.
            // Drop any zombie IDs that have no backing data.
            const reconciledIds = Object.keys(parsedFavorites);
            const prefIds = loadedPrefs.favorites || [];
            const needsReconcile =
              reconciledIds.length !== prefIds.length ||
              reconciledIds.some((id) => !prefIds.includes(id));
            if (needsReconcile) {
              const reconciled = { ...loadedPrefs, favorites: reconciledIds };
              setPreferences(reconciled);
              await AsyncStorage.setItem(
                STORAGE_KEYS.PREFERENCES,
                JSON.stringify(reconciled)
              );
              loadedPrefs = reconciled;
            }
          } catch (e) {
            console.error("Error parsing favorites data:", e);
          }
        }

        // Seed shared context with saved zip on first mount only (don't overwrite an active search)
        if (!initialSyncDone.current && !currentSearchParams.zipCode) {
          const savedZip = loadedPrefs.defaultZipCode || loadedPrefs.defaultPostalCode || "";
          const savedRadius = loadedPrefs.defaultRadius || 10;
          if (savedZip) {
            setCurrentSearchParams({ zipCode: savedZip, radius: savedRadius });
          }
          initialSyncDone.current = true;
        }
      } catch (error) {
        console.error("Error loading preferences:", error);
      } finally {
        setPrefsLoading(false);
      }
    };
    loadPreferences();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tRPC query for fetching restaurants from server
  const searchQuery = trpc.restaurant.search.useQuery(
    {
      postalCode: currentSearchParams.zipCode,
      radius: currentSearchParams.radius,
      limit: 50,
    },
    {
      enabled: !prefsLoading && !!currentSearchParams.zipCode && currentSearchParams.zipCode.length >= 2,
      staleTime: CACHE_DURATION_MS,
      retry: 2,
    }
  );
  
  // Handle query errors
  useEffect(() => {
    if (searchQuery.error) {
      console.error('[useRestaurantStorage] Server fetch failed:', searchQuery.error);
      setRestaurantsError('Failed to fetch restaurants. Please try again.');
    }
  }, [searchQuery.error]);

  // Update restaurants when server data arrives
  useEffect(() => {
    if (searchQuery.data) {
      // Transform server data to client Restaurant type
      const transformed = searchQuery.data.map(transformServerRestaurant);
      setRestaurants(transformed);
      setRestaurantsError(null);
      
      // Cache the results
      cacheRestaurants(transformed).catch(console.error);
    }
  }, [searchQuery.data]);

  // Load cached restaurants on mount (for offline/fast startup)
  useEffect(() => {
    const loadCachedRestaurants = async () => {
      try {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_RESTAURANTS);
        const timestamp = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_TIMESTAMP);
        
        if (cached && timestamp) {
          const cacheAge = Date.now() - parseInt(timestamp, 10);
          if (cacheAge < CACHE_DURATION_MS) {
            const parsed = JSON.parse(cached);
            if (restaurants.length === 0) {
              setRestaurants(parsed);
            }
          }
        }
      } catch (error) {
        console.error("Error loading cached restaurants:", error);
      } finally {
        setCacheLoaded(true);
      }
    };
    loadCachedRestaurants();
  }, []);

  const loading = prefsLoading || (!cacheLoaded && restaurants.length === 0) || (searchQuery.isLoading && restaurants.length === 0);

  // Cache restaurants locally
  async function cacheRestaurants(data: Restaurant[]) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CACHED_RESTAURANTS, JSON.stringify(data));
      await AsyncStorage.setItem(STORAGE_KEYS.CACHE_TIMESTAMP, Date.now().toString());
    } catch (error) {
      console.error("Error caching restaurants:", error);
    }
  }

  // Infer dietary options from categories, cuisine type, and restaurant name.
  // Uses explicit keywords plus cuisine-type heuristics for broader coverage.
  function inferDietaryOptions(categories: string[], cuisineType: string, restaurantName?: string): DietaryOption[] {
    const searchText = [...categories, cuisineType].join(' ').toLowerCase();
    const nameText = (restaurantName || '').toLowerCase();

    const dietaryKeywords: Record<DietaryOption, string[]> = {
      'vegetarian': [
        'vegetarian', 'veggie', 'meatless', 'plant-based', 'plant based',
        'meat-free', 'meat free', 'vegetarian-friendly',
      ],
      'vegan': [
        'vegan', 'plant-based', 'plant based', 'raw vegan', 'plant kitchen',
      ],
      'gluten-free': [
        'gluten-free', 'gluten free', 'celiac', 'gluten friendly',
        'wheat-free', 'wheat free',
      ],
      'halal': [
        'halal', 'halal certified', 'zabiha',
      ],
      'kosher': [
        'kosher', 'kosher certified', 'pareve',
      ],
      'dairy-free': [
        'dairy-free', 'dairy free', 'lactose-free', 'lactose free',
        'milk-free', 'milk free',
      ],
      'nut-free': [
        'nut-free', 'nut free', 'peanut-free', 'peanut free',
      ],
      'keto': [
        'keto', 'ketogenic', 'keto friendly',
      ],
      'low-carb': [
        'low-carb', 'low carb', 'carb-conscious',
      ],
    };

    const dietary: DietaryOption[] = [];
    for (const [option, keywords] of Object.entries(dietaryKeywords)) {
      if (keywords.some(kw => searchText.includes(kw) || nameText.includes(kw))) {
        dietary.push(option as DietaryOption);
      }
    }

    // Cuisine-type heuristics: many cuisines commonly offer these options
    const cuisineLower = cuisineType.toLowerCase();
    const cuisineDietaryMap: Record<string, DietaryOption[]> = {
      'indian': ['vegetarian'],
      'thai': ['vegetarian', 'gluten-free'],
      'japanese': ['gluten-free'],
      'mexican': ['vegetarian', 'gluten-free'],
      'mediterranean': ['vegetarian', 'gluten-free'],
      'middle eastern': ['halal', 'vegetarian'],
      'turkish': ['halal'],
      'lebanese': ['halal', 'vegetarian'],
      'vietnamese': ['gluten-free'],
      'salad': ['vegetarian', 'vegan', 'gluten-free'],
      'juice': ['vegan', 'gluten-free'],
      'smoothie': ['vegan', 'gluten-free'],
      'health food': ['vegetarian', 'vegan', 'gluten-free'],
    };

    for (const [cuisine, options] of Object.entries(cuisineDietaryMap)) {
      if (cuisineLower.includes(cuisine)) {
        options.forEach(opt => dietary.push(opt));
      }
    }

    return [...new Set(dietary)];
  }

  // Transform server restaurant data to client format
  // Map raw Google Places types to readable labels
  const CUISINE_TYPE_MAP: Record<string, string> = {
    // Generic fallbacks
    restaurant: 'Restaurant',
    food: 'Restaurant',
    point_of_interest: 'Restaurant',
    establishment: 'Restaurant',
    // Service types
    meal_takeaway: 'Carryout',
    meal_delivery: 'Delivery',
    // Specific cuisines
    american_restaurant: 'American',
    barbecue_restaurant: 'BBQ',
    bbq_restaurant: 'BBQ',
    brazilian_restaurant: 'Brazilian',
    breakfast_restaurant: 'Breakfast',
    brunch_restaurant: 'Brunch',
    burger_restaurant: 'Burgers',
    hamburger_restaurant: 'Burgers',
    cafe: 'Cafe',
    coffee_shop: 'Coffee',
    chicken_restaurant: 'Chicken',
    chinese_restaurant: 'Chinese',
    diner: 'Diner',
    fast_food_restaurant: 'Fast Food',
    french_restaurant: 'French',
    greek_restaurant: 'Greek',
    indian_restaurant: 'Indian',
    indonesian_restaurant: 'Indonesian',
    italian_restaurant: 'Italian',
    japanese_restaurant: 'Japanese',
    korean_restaurant: 'Korean',
    lebanese_restaurant: 'Lebanese',
    mediterranean_restaurant: 'Mediterranean',
    mexican_restaurant: 'Mexican',
    middle_eastern_restaurant: 'Middle Eastern',
    noodle_restaurant: 'Noodles',
    pizza_restaurant: 'Pizza',
    ramen_restaurant: 'Ramen',
    sandwich_shop: 'Sandwiches',
    seafood_restaurant: 'Seafood',
    steak_house: 'Steakhouse',
    sushi_restaurant: 'Sushi',
    thai_restaurant: 'Thai',
    turkish_restaurant: 'Turkish',
    vegan_restaurant: 'Vegan',
    vegetarian_restaurant: 'Vegetarian',
    vietnamese_restaurant: 'Vietnamese',
    bakery: 'Bakery',
    bar: 'Bar',
    bar_and_grill: 'Bar & Grill',
    buffet_restaurant: 'Buffet',
    food_court: 'Food Court',
    ice_cream_shop: 'Ice Cream',
    pub: 'Pub',
  };

  /** Convert any unmapped snake_case Google type to Title Case */
  function normalizeGoogleType(raw: string): string {
    if (CUISINE_TYPE_MAP[raw]) return CUISINE_TYPE_MAP[raw];
    return raw
      .replace(/_restaurant$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function transformServerRestaurant(serverRestaurant: any): Restaurant {
    const categories = serverRestaurant.categories || [];
    const rawCuisine = serverRestaurant.cuisineType || 'Restaurant';
    const cuisineType = normalizeGoogleType(rawCuisine);
    const restaurantName = serverRestaurant.name || '';
    
    const dietaryOptions = inferDietaryOptions(categories, cuisineType, restaurantName);
    
    return {
      id: serverRestaurant.id,
      name: restaurantName,
      cuisineType,
      address: serverRestaurant.address || '',
      city: serverRestaurant.city || '',
      state: serverRestaurant.state || '',
      zipCode: serverRestaurant.zipCode || '',
      latitude: serverRestaurant.latitude || 0,
      longitude: serverRestaurant.longitude || 0,
      phone: serverRestaurant.phone,
      website: serverRestaurant.website,
      facebookUrl: serverRestaurant.facebookUrl,
      yelpUrl: serverRestaurant.yelpUrl,
      googleMapsUrl: serverRestaurant.googleMapsUrl,
      doordashUrl: serverRestaurant.doordashUrl,
      ubereatsUrl: serverRestaurant.ubereatsUrl,
      grubhubUrl: serverRestaurant.grubhubUrl,
      isCulvers: serverRestaurant.isCulvers || false,
      flavorOfTheDay: serverRestaurant.flavorOfTheDay,
      flavorDescription: serverRestaurant.flavorDescription,
      ratings: {
        aggregated: serverRestaurant.ratings?.aggregated || 0,
        totalReviews: serverRestaurant.ratings?.totalReviews || 0,
        google: serverRestaurant.ratings?.google,
        googleReviewCount: serverRestaurant.ratings?.googleReviewCount,
        foursquare: serverRestaurant.ratings?.foursquare,
        foursquareReviewCount: serverRestaurant.ratings?.foursquareReviewCount,
        here: serverRestaurant.ratings?.here,
        hereReviewCount: serverRestaurant.ratings?.hereReviewCount,
      },
      priceRange: serverRestaurant.priceRange,
      hours: serverRestaurant.hours,
      categories,
      dietaryOptions,
      description: serverRestaurant.reviewSummary,
      photos: Array.from(new Set<string>(serverRestaurant.photos || [])),
      menu: serverRestaurant.menu || (serverRestaurant.menuUrl ? { url: serverRestaurant.menuUrl } : undefined),
      sentiment: serverRestaurant.sentiment,
      reviewSummary: serverRestaurant.reviewSummary,
      dailySpecial: serverRestaurant.dailySpecial,
      lastUpdated: serverRestaurant.scrapedAt,
      dataSources: serverRestaurant.sources || [],
    };
  }

  // Save preferences to storage
  const savePreferences = useCallback(async (newPrefs: Partial<UserPreferences>) => {
    try {
      const updated = { ...preferences, ...newPrefs };
      await retryOperation(() => 
        AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(updated))
      );
      setPreferences(updated);
      
      // Clear cache when preferences change so new data is fetched
      if (newPrefs.defaultZipCode || newPrefs.defaultRadius) {
        await AsyncStorage.removeItem(STORAGE_KEYS.CACHED_RESTAURANTS);
        await AsyncStorage.removeItem(STORAGE_KEYS.CACHE_TIMESTAMP);
      }
    } catch (error) {
      console.error("Error saving preferences after retries:", error);
      Alert.alert(
        "Save Failed",
        "Unable to save preferences. Please check your device storage and try again."
      );
    }
  }, [preferences]);

  // Refetch restaurants (manual refresh)
  const refetchRestaurants = useCallback(async () => {
    setRestaurantsError(null);
    await searchQuery.refetch();
  }, [searchQuery]);

  // Search restaurants with new ZIP code/radius (triggers immediate API call)
  const searchWithNewParams = useCallback(async (
    zipCode: string,
    radius: number
  ) => {
    setRestaurantsError(null);
    setCurrentSearchParams({ zipCode, radius });
  }, []);

  // Search restaurants with different parameters
  const searchRestaurantsWithParams = useCallback(async (
    zipCode: string,
    radius: number,
    cuisineType?: string
  ): Promise<Restaurant[]> => {
    // First update search parameters to trigger API call
    await searchWithNewParams(zipCode, radius);
    
    // Then filter results if cuisine type specified
    if (cuisineType) {
      return restaurants.filter(r => 
        r.cuisineType.toLowerCase().includes(cuisineType.toLowerCase())
      );
    }
    return restaurants;
  }, [restaurants, searchWithNewParams]);

  // Toggle favorite status.
  // Accepts either a full Restaurant (preferred — persists a snapshot so the
  // Favorites tab survives search changes / cache expiry) or a bare id (legacy;
  // falls back to looking up the current in-memory restaurants list).
  //
  // Uses a functional state update so two rapid-fire taps on the same or
  // different restaurants can't clobber each other via stale closures.
  const toggleFavorite = useCallback(async (restaurantOrId: Restaurant | string) => {
    const restaurantId =
      typeof restaurantOrId === "string" ? restaurantOrId : restaurantOrId.id;
    const providedRestaurant: Restaurant | undefined =
      typeof restaurantOrId === "string" ? undefined : restaurantOrId;

    // Compute the next state inside the functional update so we always
    // see the latest committed value. We still need to resolve the full
    // Restaurant object, which requires either `providedRestaurant` or a
    // lookup via the current `restaurants` list / existing snapshot.
    let nextDataForWrite: Record<string, Restaurant> | null = null;

    setFavoritesData((prev) => {
      const isCurrentlyFavorite = !!prev[restaurantId];
      const next = { ...prev };

      if (isCurrentlyFavorite) {
        delete next[restaurantId];
      } else {
        const resolved =
          providedRestaurant ??
          prev[restaurantId] ??
          restaurants.find((r) => r.id === restaurantId);
        if (!resolved) {
          console.warn(
            `[useRestaurantStorage] Cannot favorite ${restaurantId}: no restaurant data available`
          );
          return prev;
        }
        next[restaurantId] = resolved;
      }

      nextDataForWrite = next;
      return next;
    });

    // Persist the snapshot (and sync preferences.favorites) AFTER the state
    // update has captured the correct next value. If we decided not to change
    // anything (e.g. missing restaurant data), nextDataForWrite stays null.
    if (nextDataForWrite) {
      const snapshot = nextDataForWrite;
      await AsyncStorage.setItem(
        STORAGE_KEYS.FAVORITES_DATA,
        JSON.stringify(snapshot)
      );
      await savePreferences({ favorites: Object.keys(snapshot) });
    }
  }, [restaurants, savePreferences]);

  // Check if restaurant is favorite
  const isFavorite = useCallback((restaurantId: string) => {
    return preferences.favorites.includes(restaurantId);
  }, [preferences.favorites]);

  // Get restaurants with distance calculated from user coordinates
  const getRestaurantsWithDistance = useCallback((coords?: { lat: number; lon: number } | null): Restaurant[] => {
    if (!coords) {
      return restaurants.map((r) => ({ ...r, distance: undefined }));
    }

    return restaurants.map((restaurant) => ({
      ...restaurant,
      distance: calculateDistance(
        coords.lat,
        coords.lon,
        restaurant.latitude,
        restaurant.longitude
      ),
    }));
  }, [restaurants]);

  // Filter restaurants
  const filterRestaurants = useCallback((
    restaurantList: Restaurant[],
    filters: FilterOptions
  ): Restaurant[] => {
    return restaurantList.filter((restaurant) => {
      // Distance filter
      if (filters.maxDistance && restaurant.distance !== undefined) {
        if (restaurant.distance > filters.maxDistance) return false;
      }

      // Cuisine filter
      if (filters.cuisineTypes.length > 0) {
        if (!filters.cuisineTypes.includes(restaurant.cuisineType)) return false;
      }

      // Has special filter
      if (filters.hasSpecialOnly && !restaurant.dailySpecial) {
        return false;
      }

      // Search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesName = restaurant.name.toLowerCase().includes(query);
        const matchesCuisine = restaurant.cuisineType.toLowerCase().includes(query);
        const matchesAddress = restaurant.address.toLowerCase().includes(query);
        if (!matchesName && !matchesCuisine && !matchesAddress) return false;
      }

      return true;
    });
  }, []);

  // Get random restaurant within distance
  const getRandomRestaurant = useCallback((
    coords: { lat: number; lon: number } | null,
    maxDistance: number
  ): Restaurant | null => {
    const withDistance = getRestaurantsWithDistance(coords);
    const filtered = withDistance.filter(
      (r) => r.distance !== undefined && r.distance <= maxDistance
    );

    if (filtered.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * filtered.length);
    return filtered[randomIndex];
  }, [getRestaurantsWithDistance]);

  // Get favorite restaurants from the persistent favorites snapshot.
  // Independent of the current search results — favorites survive zip changes,
  // cache expiry, and cold starts.
  const getFavoriteRestaurants = useCallback((): Restaurant[] => {
    return Object.values(favoritesData);
  }, [favoritesData]);

  // Get restaurant by ID
  const getRestaurantById = useCallback((id: string): Restaurant | undefined => {
    return restaurants.find((r) => r.id === id);
  }, [restaurants]);

  // Get unique cuisine types from current restaurants
  const cuisineTypes = useMemo(() => {
    const types = new Set(restaurants.map(r => r.cuisineType));
    return Array.from(types).sort();
  }, [restaurants]);

  // Update personal notes for a restaurant
  const updateRestaurantNotes = useCallback(async (restaurantId: string, notes: string) => {
    try {
      const updated = { ...personalNotes };
      // Preserve whitespace as typed so trailing spaces/newlines don't get
      // eaten on every keystroke when this is wired to onChangeText. Only
      // drop the entry when the field is effectively empty.
      if (notes.trim().length > 0) {
        updated[restaurantId] = notes;
      } else {
        delete updated[restaurantId];
      }
      await AsyncStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(updated));
      setPersonalNotes(updated);
    } catch (error) {
      console.error("Error saving notes:", error);
    }
  }, [personalNotes]);

  // Get personal notes for a restaurant
  const getRestaurantNotes = useCallback((restaurantId: string): string | undefined => {
    return personalNotes[restaurantId];
  }, [personalNotes]);

  return {
    restaurants,
    preferences,
    loading,
    error: restaurantsError,
    cuisineTypes,
    savePreferences,
    toggleFavorite,
    isFavorite,
    getRestaurantsWithDistance,
    filterRestaurants,
    getRandomRestaurant,
    getFavoriteRestaurants,
    getRestaurantById,
    refetchRestaurants,
    searchRestaurantsWithParams,
    searchWithNewParams,
    updateRestaurantNotes,
    getRestaurantNotes,
  };
}

export default useRestaurantStorage;
