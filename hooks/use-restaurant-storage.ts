// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-MMDNRRRMRQUS
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
import {
  favoritesStore,
  personalNotesStore,
  preferencesStore,
} from "@/utils/shared-store";

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

// Pending-write flags are module-level (like the shared stores) so whichever
// screen sees the app go to the background flushes the latest shared value,
// and screens with nothing new to save don't write at all.
let favoritesPendingWrite = false;
let notesPendingWrite = false;

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
  // Start from the shared snapshots when another screen already loaded them,
  // so a freshly mounted screen (e.g. the detail page) never flashes stale
  // defaults or an empty favorites/notes list.
  const [preferences, setPreferences] = useState<UserPreferences>(
    () => preferencesStore.get() ?? DEFAULT_PREFERENCES
  );
  const [prefsLoading, setPrefsLoading] = useState(() => preferencesStore.get() === null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [restaurantsError, setRestaurantsError] = useState<string | null>(null);
  const [personalNotes, setPersonalNotes] = useState<Record<string, string>>(
    () => personalNotesStore.get() ?? {}
  );
  const [favoritesData, setFavoritesData] = useState<Record<string, Restaurant>>(
    () => favoritesStore.get() ?? {}
  );
  const [cacheLoaded, setCacheLoaded] = useState(false);

  // Shared search params from context so all tabs stay in sync
  const { currentSearchParams, setCurrentSearchParams } = useRestaurantSearchContext();

  // Track if we've done initial sync to avoid duplicate triggers
  const initialSyncDone = useRef(false);
  const preferencesRef = useRef(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  // Every screen calls this hook separately; keep them all on the same
  // preferences, favorites and notes so a change on one tab shows on every
  // other tab and no stale copy can be written back over it.
  useEffect(() => {
    const unsubscribers = [
      preferencesStore.subscribe((next) => {
        preferencesRef.current = next;
        setPreferences(next);
      }),
      favoritesStore.subscribe(setFavoritesData),
      personalNotesStore.subscribe(setPersonalNotes),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  // Load preferences from storage - sync search params in same effect to avoid race.
  // Uses multiGet to collapse 3+ sequential JNI bridge hops into a single call —
  // previously this was ~150-300ms of cold-start delay depending on the phone.
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const [
          [, stored],
          [, legacyStored],
          [, notesStored],
          [, favoritesStored],
        ] = await AsyncStorage.multiGet([
          STORAGE_KEYS.PREFERENCES,
          "@foodie_finder_preferences",
          STORAGE_KEYS.PERSONAL_NOTES,
          STORAGE_KEYS.FAVORITES_DATA,
        ]);

        let loadedPrefs = DEFAULT_PREFERENCES;
        const prefsJson = stored || legacyStored;
        if (prefsJson) {
          const parsed = JSON.parse(prefsJson);
          loadedPrefs = { ...DEFAULT_PREFERENCES, ...parsed };
          // Migrate legacy key to canonical storage if needed
          if (!stored && legacyStored) {
            await AsyncStorage.setItem(
              STORAGE_KEYS.PREFERENCES,
              JSON.stringify(loadedPrefs)
            );
          }
        }

        // Also load personal notes. Another screen's copy (loaded or edited
        // while this read was in flight) wins over what storage handed us.
        if (personalNotesStore.get() === null) {
          personalNotesStore.publish(notesStored ? JSON.parse(notesStored) : {});
        }

        // Load favorites data (full restaurant snapshots, independent of search cache)
        if (favoritesStored) {
          try {
            const parsedFavorites: Record<string, Restaurant> = JSON.parse(favoritesStored);
            if (favoritesStore.get() === null) {
              favoritesStore.publish(parsedFavorites);
            }
            // Reconcile: preferences.favorites should match the keys of favoritesData.
            // Drop any zombie IDs that have no backing data.
            const reconciledIds = Object.keys(parsedFavorites);
            const prefIds = loadedPrefs.favorites || [];
            const needsReconcile =
              preferencesStore.get() === null &&
              (reconciledIds.length !== prefIds.length ||
              reconciledIds.some((id) => !prefIds.includes(id)));
            if (needsReconcile) {
              const reconciled = { ...loadedPrefs, favorites: reconciledIds };
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
        if (favoritesStore.get() === null) {
          favoritesStore.publish({});
        }

        // Another screen may have loaded or saved preferences while this read
        // was in flight. Its copy is newer than what storage handed us.
        const shared = preferencesStore.get();
        if (shared) {
          loadedPrefs = shared;
          preferencesRef.current = shared;
          setPreferences(shared);
        } else {
          preferencesStore.publish(loadedPrefs);
        }

        // Seed shared context with saved zip on first mount only (don't overwrite an active search)
        if (!initialSyncDone.current && !currentSearchParams.zipCode) {
          const savedZip = loadedPrefs.defaultZipCode || loadedPrefs.defaultPostalCode || "";
          const savedRadius = loadedPrefs.defaultRadius || 10;
          if (savedZip) {
            setCurrentSearchParams({
              zipCode: savedZip,
              radius: savedRadius,
              countryCode: loadedPrefs.defaultCountryCode ?? null,
            });
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
      countryCode: currentSearchParams.countryCode,
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

  // Save preferences to storage. Builds on the shared snapshot (updated
  // synchronously) so rapid saves from any screen compose instead of one
  // screen's stale copy overwriting another's change.
  const savePreferences = useCallback(async (newPrefs: Partial<UserPreferences>) => {
    try {
      const prev = preferencesStore.get() ?? preferencesRef.current;
      const next = { ...prev, ...newPrefs };
      // Keep postal/zip aliases in sync
      if (newPrefs.defaultPostalCode !== undefined) {
        next.defaultZipCode = newPrefs.defaultPostalCode;
      }
      if (newPrefs.defaultZipCode !== undefined) {
        next.defaultPostalCode = newPrefs.defaultZipCode;
      }
      preferencesStore.publish(next);
      await retryOperation(() =>
        AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(next))
      );

      // Clear cache when location preferences change so new data is fetched
      if (
        newPrefs.defaultZipCode !== undefined ||
        newPrefs.defaultPostalCode !== undefined ||
        newPrefs.defaultRadius !== undefined
      ) {
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

  // Search restaurants with new ZIP code/radius (triggers immediate API call).
  // Also persists location to preferences so Home, Browse, and Settings stay in sync.
  // countryCode: pass the GPS country with a GPS-derived zip; omit it for a
  // typed zip (a new zip then drops the old country, the same zip keeps it).
  const searchWithNewParams = useCallback(async (
    zipCode: string,
    radius: number,
    options?: { persist?: boolean; countryCode?: string | null }
  ) => {
    setRestaurantsError(null);
    setCurrentSearchParams({ zipCode, radius, countryCode: options?.countryCode });

    if (options?.persist === false) return;

    const zip = zipCode.trim();
    if (!zip) return;

    const prev = preferencesRef.current;
    const countryCode =
      options?.countryCode === null
        ? undefined
        : options?.countryCode ??
          (prev.defaultZipCode === zip ? prev.defaultCountryCode : undefined);
    const locationChanged =
      prev.defaultZipCode !== zip ||
      prev.defaultPostalCode !== zip ||
      prev.defaultRadius !== radius ||
      prev.defaultCountryCode !== countryCode;
    if (locationChanged) {
      await savePreferences({
        defaultZipCode: zip,
        defaultPostalCode: zip,
        defaultRadius: radius,
        defaultCountryCode: countryCode,
      });
    }
  }, [setCurrentSearchParams, savePreferences]);

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

  // Toggle favorite status.
  // Accepts either a full Restaurant (preferred — persists a snapshot so the
  // Favorites tab survives search changes / cache expiry) or a bare id (legacy;
  // falls back to looking up the current in-memory restaurants list).
  //
  // Builds on the shared favorites snapshot (updated synchronously) so two
  // rapid-fire taps, even from different screens, can't clobber each other.
  const toggleFavorite = useCallback(async (restaurantOrId: Restaurant | string) => {
    const restaurantId =
      typeof restaurantOrId === "string" ? restaurantOrId : restaurantOrId.id;
    const providedRestaurant: Restaurant | undefined =
      typeof restaurantOrId === "string" ? undefined : restaurantOrId;

    const prev = favoritesStore.get();
    if (prev === null) {
      // Favorites haven't loaded yet; writing now would replace the saved list.
      console.warn("[useRestaurantStorage] Favorites not loaded yet; ignoring toggle");
      return;
    }

    let nextDataForWrite: Record<string, Restaurant> | null = null;
    if (prev[restaurantId]) {
      const next = { ...prev };
      delete next[restaurantId];
      nextDataForWrite = next;
    } else {
      const resolved =
        providedRestaurant ?? restaurants.find((r) => r.id === restaurantId);
      if (resolved) {
        nextDataForWrite = { ...prev, [restaurantId]: resolved };
      } else {
        console.warn(
          `[useRestaurantStorage] Cannot favorite ${restaurantId}: no restaurant data available`
        );
      }
    }

    // Publish to every screen, then persist the snapshot (and sync
    // preferences.favorites). If we decided not to change anything (e.g.
    // missing restaurant data), nextDataForWrite stays null.
    //
    // Deferred with InteractionManager so the favorite-star animation paints
    // before we JSON.stringify the entire favorites map — on phones with a
    // large library the serialize step can run 100ms-1s per tap, and that
    // directly causes tap latency if it happens inline.
    if (nextDataForWrite) {
      const snapshot = nextDataForWrite;
      favoritesStore.publish(snapshot);
      favoritesPendingWrite = true;
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
            if (favoritesStore.get() === snapshot) {
              favoritesPendingWrite = false;
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
      const snapshot = favoritesStore.get();
      if (!favoritesPendingWrite || snapshot === null) return;
      AsyncStorage.setItem(
        STORAGE_KEYS.FAVORITES_DATA,
        JSON.stringify(snapshot)
      )
        .then(() => {
          if (favoritesStore.get() === snapshot) {
            favoritesPendingWrite = false;
          }
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
  const flushNotes = useCallback(async () => {
    if (notesPersistTimerRef.current) {
      clearTimeout(notesPersistTimerRef.current);
      notesPersistTimerRef.current = null;
    }
    const snapshot = personalNotesStore.get();
    if (!notesPendingWrite || snapshot === null) return;
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.PERSONAL_NOTES,
        JSON.stringify(snapshot)
      );
      if (personalNotesStore.get() === snapshot) {
        notesPendingWrite = false;
      }
    } catch (error) {
      console.error("Error saving notes:", error);
    }
  }, []);

  const updateRestaurantNotes = useCallback(
    async (restaurantId: string, notes: string) => {
      const prev = personalNotesStore.get();
      if (prev === null) {
        // Notes haven't loaded yet; writing now would replace the saved notes.
        console.warn("[useRestaurantStorage] Notes not loaded yet; ignoring edit");
        return;
      }
      const next = { ...prev };
      // Preserve whitespace as typed so trailing spaces/newlines don't get
      // eaten on every keystroke. Only drop the entry when effectively empty.
      if (notes.trim().length > 0) {
        next[restaurantId] = notes;
      } else {
        delete next[restaurantId];
      }
      personalNotesStore.publish(next);
      notesPendingWrite = true;

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
  // the app leaves the foreground (only if there is something unsaved, and
  // always the shared latest, never this screen's own copy). The debounce window is 400ms, so a
  // force-kill during active typing would otherwise lose up to 400ms of
  // keystrokes — listening to AppState closes that window for the common
  // case of the user backgrounding mid-note.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        flushNotes();
      }
    });
    return () => {
      sub.remove();
      flushNotes();
    };
  }, [flushNotes]);

  // Get personal notes for a restaurant
  const getRestaurantNotes = useCallback((restaurantId: string): string | undefined => {
    return personalNotes[restaurantId];
  }, [personalNotes]);

  return {
    restaurants,
    preferences,
    currentSearchParams,
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
