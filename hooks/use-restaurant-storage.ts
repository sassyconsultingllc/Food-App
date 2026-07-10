/**
 * Restaurant Storage Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Manages restaurant data fetching from server and local storage for preferences
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Alert, AppState, InteractionManager } from "react-native";

import { calculateDistance } from "@/utils/geo-utils";
import {
  Restaurant,
  UserPreferences,
  DEFAULT_PREFERENCES,
  FilterOptions,
} from "@/types/restaurant";
import { trpc } from "@/lib/trpc";
import { useRestaurantSearchContext } from "@/context/restaurant-search-context";
import { transformServerRestaurant } from "@/utils/restaurant-transform";

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

  // Load preferences from storage - sync search params in same effect to avoid race.
  // Uses multiGet to collapse 3+ sequential JNI bridge hops into a single call —
  // previously this was ~150-300ms of cold-start delay depending on the phone.
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const [
          [, stored],
          [, notesStored],
          [, favoritesStored],
        ] = await AsyncStorage.multiGet([
          STORAGE_KEYS.PREFERENCES,
          STORAGE_KEYS.PERSONAL_NOTES,
          STORAGE_KEYS.FAVORITES_DATA,
        ]);

        let loadedPrefs = DEFAULT_PREFERENCES;
        if (stored) {
          const parsed = JSON.parse(stored);
          loadedPrefs = { ...DEFAULT_PREFERENCES, ...parsed };
          setPreferences(loadedPrefs);
        }

        // Also load personal notes
        if (notesStored) {
          setPersonalNotes(JSON.parse(notesStored));
        }

        // Load favorites data (full restaurant snapshots, independent of search cache)
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

  // Load cached restaurants on mount (for offline/fast startup).
  // One multiGet instead of two sequential getItem calls.
  //
  // Race guard: the effect has [] deps so the `restaurants` closure is
  // frozen at mount — checking `restaurants.length === 0` in there was
  // always true and could clobber a fresh server response that committed
  // just before the cache read resolved. We now use a functional setState
  // so we only replace when state is still empty at commit time.
  useEffect(() => {
    const loadCachedRestaurants = async () => {
      try {
        const [[, cached], [, timestamp]] = await AsyncStorage.multiGet([
          STORAGE_KEYS.CACHED_RESTAURANTS,
          STORAGE_KEYS.CACHE_TIMESTAMP,
        ]);

        if (cached && timestamp) {
          const cacheAge = Date.now() - parseInt(timestamp, 10);
          if (cacheAge < CACHE_DURATION_MS) {
            const parsed = JSON.parse(cached);
            setRestaurants((prev) => (prev.length === 0 ? parsed : prev));
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

  // `loading` only flips when the list is empty, so a re-search (e.g. user
  // bumps radius) is invisible to the UI. Expose `isFetching` so callers can
  // surface a small "searching…" affordance during the background refetch.
  const isFetching = searchQuery.isFetching;

  // Cache restaurants locally. Deferred via InteractionManager so the list
  // paint finishes before we spend ~100-400ms JSON.stringify'ing 50
  // restaurants worth of photos + hours + reviews.
  async function cacheRestaurants(data: Restaurant[]) {
    InteractionManager.runAfterInteractions(() => {
      AsyncStorage.multiSet([
        [STORAGE_KEYS.CACHED_RESTAURANTS, JSON.stringify(data)],
        [STORAGE_KEYS.CACHE_TIMESTAMP, Date.now().toString()],
      ]).catch((error) => console.error("Error caching restaurants:", error));
    });
  }

  // transformServerRestaurant + its helpers now live in
  // utils/restaurant-transform.ts so the detail-page getById fallback and
  // "More Like This" cards can produce identically-normalized Restaurant
  // objects (most importantly, absolute photo URLs).

  // Save preferences to storage. Functional setState so rapid saves
  // (e.g. toggling two settings in quick succession) don't clobber via
  // a stale `preferences` closure.
  const savePreferences = useCallback(async (newPrefs: Partial<UserPreferences>) => {
    try {
      let persisted: UserPreferences | null = null;
      setPreferences((prev) => {
        const next = { ...prev, ...newPrefs };
        persisted = next;
        return next;
      });
      if (persisted) {
        await retryOperation(() =>
          AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(persisted))
        );
      }

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
  }, []);

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

  // Search restaurants with different parameters.
  //
  // Important: this CANNOT synchronously return the new results. Updating
  // currentSearchParams is async (setState), and the tRPC query that
  // re-runs against those params lands on a future render. Returning
  // `restaurants` here would hand the caller the *previous* search's data,
  // which is the bug Mercury-2 caught. Callers should subscribe to the
  // hook's `restaurants` value instead and re-render when it updates.
  const searchRestaurantsWithParams = useCallback(async (
    zipCode: string,
    radius: number,
    _cuisineType?: string
  ): Promise<void> => {
    setRestaurantsError(null);
    setCurrentSearchParams({ zipCode, radius });
  // setCurrentSearchParams from context is referentially stable (it's a
  // useState setter under the hood). Empty deps keeps this callback's
  // identity stable across renders, which prevents downstream useEffects
  // from re-firing on every parent render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror of the latest favorites snapshot for the AppState backgrounding
  // flush below. Updated synchronously alongside setFavoritesData so the
  // backgrounding handler always sees the most recent intent even if the
  // deferred InteractionManager write hasn't fired yet.
  const latestFavoritesRef = useRef<Record<string, Restaurant>>(favoritesData);
  useEffect(() => {
    latestFavoritesRef.current = favoritesData;
  }, [favoritesData]);

  // Track whether there's a pending deferred favorites write so the
  // AppState handler knows to flush on background.
  const favoritesPendingWriteRef = useRef(false);

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
    //
    // Deferred with InteractionManager so the favorite-star animation paints
    // before we JSON.stringify the entire favorites map — on phones with a
    // large library the serialize step can run 100ms-1s per tap, and that
    // directly causes tap latency if it happens inline.
    if (nextDataForWrite) {
      const snapshot = nextDataForWrite;
      latestFavoritesRef.current = snapshot;
      favoritesPendingWriteRef.current = true;
      InteractionManager.runAfterInteractions(() => {
        AsyncStorage.setItem(
          STORAGE_KEYS.FAVORITES_DATA,
          JSON.stringify(snapshot)
        )
          .then(() => {
            // Only clear the pending flag if the snapshot we just persisted
            // is still the latest. If a newer toggle happened between the
            // schedule and now, leave the flag set so the next flush still
            // runs.
            if (latestFavoritesRef.current === snapshot) {
              favoritesPendingWriteRef.current = false;
            }
          })
          .catch((e) => console.error("Error persisting favorites:", e));
        savePreferences({ favorites: Object.keys(snapshot) }).catch((e) =>
          console.error("Error saving favorites pref:", e)
        );
      });
    }
  }, [restaurants, savePreferences]);

  // Flush any pending favorites write when the app leaves the foreground or
  // the hook unmounts. Without this, a force-kill or rapid background while
  // InteractionManager is still queued would lose the toggle silently —
  // exactly the data-loss case Mercury-2 flagged.
  useEffect(() => {
    const flushFavorites = () => {
      if (!favoritesPendingWriteRef.current) return;
      const snapshot = latestFavoritesRef.current;
      AsyncStorage.setItem(
        STORAGE_KEYS.FAVORITES_DATA,
        JSON.stringify(snapshot)
      )
        .then(() => {
          favoritesPendingWriteRef.current = false;
        })
        .catch((e) => console.error("Error flushing favorites on bg:", e));
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") flushFavorites();
    });
    return () => {
      sub.remove();
      flushFavorites();
    };
  }, []);

  // Check if restaurant is favorite.
  // Read from `favoritesData` (the source of truth) rather than
  // `preferences.favorites` — the latter lags by one render after a
  // toggle because preferences is only synced inside the
  // InteractionManager.runAfterInteractions deferred write. Reading from
  // favoritesData is O(1) and always reflects the most recent toggle.
  const isFavorite = useCallback((restaurantId: string) => {
    return !!favoritesData[restaurantId];
  }, [favoritesData]);

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

  // Get restaurant by ID.
  // Check the current search results first, then fall back to the persistent
  // favorites snapshot. Without the favorites fallback, opening a favorited
  // restaurant from the Favorites tab (or a taste-match / "More Like This"
  // card) that isn't in the *current* ZIP search rendered "Restaurant not
  // found" even though we hold a full snapshot of it — the detail screen only
  // ever looked at `restaurants`. Genuinely-remote ids (vector results never
  // searched locally) are resolved by the server getById fallback in the
  // detail screen.
  const getRestaurantById = useCallback((id: string): Restaurant | undefined => {
    return restaurants.find((r) => r.id === id) || favoritesData[id];
  }, [restaurants, favoritesData]);

  // Get unique cuisine types from current restaurants
  const cuisineTypes = useMemo(() => {
    const types = new Set(restaurants.map(r => r.cuisineType));
    return Array.from(types).sort();
  }, [restaurants]);

  // Update personal notes for a restaurant.
  //
  // Called on every keystroke from PersonalNotesModal's onChangeText, so
  // we must NOT JSON.stringify the whole notes map here — that was an ANR
  // footgun on phones with lots of saved notes. Instead:
  //   1. Update in-memory state synchronously (cheap).
  //   2. Debounce the AsyncStorage write by ~400ms of idle typing.
  // When the modal dismisses it also calls this one last time with the
  // committed text, which flushes immediately via the same debouncer.
  const notesPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNotesRef = useRef<Record<string, string>>(personalNotes);
  useEffect(() => {
    latestNotesRef.current = personalNotes;
  }, [personalNotes]);

  const flushNotes = useCallback(async () => {
    if (notesPersistTimerRef.current) {
      clearTimeout(notesPersistTimerRef.current);
      notesPersistTimerRef.current = null;
    }
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.PERSONAL_NOTES,
        JSON.stringify(latestNotesRef.current)
      );
    } catch (error) {
      console.error("Error saving notes:", error);
    }
  }, []);

  const updateRestaurantNotes = useCallback(
    async (restaurantId: string, notes: string) => {
      setPersonalNotes((prev) => {
        const next = { ...prev };
        // Preserve whitespace as typed so trailing spaces/newlines don't get
        // eaten on every keystroke. Only drop the entry when effectively empty.
        if (notes.trim().length > 0) {
          next[restaurantId] = notes;
        } else {
          delete next[restaurantId];
        }
        latestNotesRef.current = next;
        return next;
      });

      if (notesPersistTimerRef.current) {
        clearTimeout(notesPersistTimerRef.current);
      }
      notesPersistTimerRef.current = setTimeout(() => {
        notesPersistTimerRef.current = null;
        flushNotes();
      }, 400);
    },
    [flushNotes]
  );

  // Flush any pending notes write when the hook unmounts AND whenever
  // the app leaves the foreground. The debounce window is 400ms, so a
  // force-kill during active typing would otherwise lose up to 400ms of
  // keystrokes — listening to AppState closes that window for the common
  // case of the user backgrounding mid-note.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (notesPersistTimerRef.current) {
          clearTimeout(notesPersistTimerRef.current);
          notesPersistTimerRef.current = null;
        }
        AsyncStorage.setItem(
          STORAGE_KEYS.PERSONAL_NOTES,
          JSON.stringify(latestNotesRef.current)
        ).catch(() => {});
      }
    });
    return () => {
      sub.remove();
      if (notesPersistTimerRef.current) {
        clearTimeout(notesPersistTimerRef.current);
        notesPersistTimerRef.current = null;
      }
      AsyncStorage.setItem(
        STORAGE_KEYS.PERSONAL_NOTES,
        JSON.stringify(latestNotesRef.current)
      ).catch(() => {});
    };
  }, []);

  // Get personal notes for a restaurant
  const getRestaurantNotes = useCallback((restaurantId: string): string | undefined => {
    return personalNotes[restaurantId];
  }, [personalNotes]);

  return {
    restaurants,
    preferences,
    loading,
    isFetching,
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
