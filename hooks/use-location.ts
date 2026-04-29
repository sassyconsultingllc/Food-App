/**
 * GPS Location Hook - INTERNATIONAL
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Provides GPS location detection and reverse geocoding to postal code
 * Works worldwide - no country restrictions
 */

import * as Location from "expo-location";
import { useState, useCallback, useEffect, useRef } from "react";

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  postalCode: string | null;   // International postal code
  zipCode: string | null;       // Legacy alias for postalCode
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;   // ISO 3166-1 alpha-2
  loading: boolean;
  error: string | null;
  permissionStatus: Location.PermissionStatus | null;
}

const initialState: LocationState = {
  latitude: null,
  longitude: null,
  postalCode: null,
  zipCode: null,
  city: null,
  state: null,
  country: null,
  countryCode: null,
  loading: false,
  error: null,
  permissionStatus: null,
};

const NOMINATIM_TIMEOUT_MS = 10_000;

/**
 * Reverse geocode coordinates to location info using Nominatim (free, worldwide).
 * Accepts an AbortSignal so the caller can cancel on unmount or new request.
 */
async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<{
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
}> {
  // Compose the caller's signal with a timeout so a hung Nominatim request
  // can never strand the spinner indefinitely.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), NOMINATIM_TIMEOUT_MS);
  const onCallerAbort = () => timeoutController.abort();
  signal?.addEventListener("abort", onCallerAbort);

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', latitude.toString());
    url.searchParams.set('lon', longitude.toString());
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'FoodieFinder/2.0 (International) contact@sassyconsultingllc.com',
      },
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      console.warn('[Location] Reverse geocoding failed:', response.status);
      return { postalCode: null, city: null, state: null, country: null, countryCode: null };
    }

    const data = await response.json();
    const address = data.address || {};

    return {
      postalCode: address.postcode || null,
      city: address.city || address.town || address.village || address.municipality || null,
      state: address.state || address.province || address.region || null,
      country: address.country || null,
      countryCode: address.country_code?.toUpperCase() || null,
    };
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      // Either the timeout fired or the caller unmounted — propagate so
      // the caller can decide whether to surface an error.
      throw error;
    }
    console.error('[Location] Reverse geocoding error:', error);
    return { postalCode: null, city: null, state: null, country: null, countryCode: null };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

/**
 * Hook for getting user's GPS location with reverse geocoding
 */
export function useLocation() {
  const [location, setLocation] = useState<LocationState>(initialState);

  // isMounted gate to prevent setState-on-unmounted-component warnings
  // (and the resulting React DevTools crash) when the user navigates away
  // while a location/reverse-geocode round-trip is in flight.
  const isMountedRef = useRef(true);
  // Single in-flight AbortController so a second requestLocation cancels
  // the first one cleanly instead of leaking a hung Nominatim fetch.
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, []);

  const safeSetLocation = useCallback(
    (updater: LocationState | ((prev: LocationState) => LocationState)) => {
      if (!isMountedRef.current) return;
      setLocation(updater as LocationState);
    },
    []
  );

  const requestLocation = useCallback(async () => {
    // Cancel any prior in-flight request before starting a new one.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    safeSetLocation((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (controller.signal.aborted || !isMountedRef.current) return;
      safeSetLocation((prev) => ({ ...prev, permissionStatus: status }));

      if (status !== "granted") {
        safeSetLocation((prev) => ({
          ...prev,
          loading: false,
          error: "Location permission denied. Please enable location access in your device settings.",
        }));
        return;
      }

      // Get current position with high accuracy
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (controller.signal.aborted || !isMountedRef.current) return;

      const { latitude, longitude } = position.coords;

      // Reverse geocode to get postal code and location info
      const geoResult = await reverseGeocode(latitude, longitude, controller.signal);

      if (controller.signal.aborted || !isMountedRef.current) return;

      safeSetLocation({
        latitude,
        longitude,
        postalCode: geoResult.postalCode,
        zipCode: geoResult.postalCode, // Legacy alias
        city: geoResult.city,
        state: geoResult.state,
        country: geoResult.country,
        countryCode: geoResult.countryCode,
        loading: false,
        error: null,
        permissionStatus: status,
      });
    } catch (error) {
      // Don't surface AbortError as a user-visible error — that's our own
      // unmount/cancel path, not a real failure.
      if ((error as { name?: string })?.name === "AbortError") return;
      console.error("[Location] Error getting location:", error);
      safeSetLocation((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to get location",
      }));
    } finally {
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
      }
    }
  }, [safeSetLocation]);

  const clearLocation = useCallback(() => {
    inFlightRef.current?.abort();
    inFlightRef.current = null;
    safeSetLocation(initialState);
  }, [safeSetLocation]);

  return {
    ...location,
    requestLocation,
    // Legacy alias for backward compatibility
    getCurrentLocation: requestLocation,
    clearLocation,
    hasLocation: location.latitude !== null && location.longitude !== null,
    hasPostalCode: location.postalCode !== null,
    // Legacy alias
    hasZipCode: location.postalCode !== null,
  };
}

/**
 * Get the default distance unit based on country code
 */
export function getDefaultDistanceUnit(countryCode: string | null): 'miles' | 'km' {
  // Countries that use miles: US, UK, Myanmar, Liberia
  const milesCountries = ['US', 'GB', 'UK', 'MM', 'LR'];
  return countryCode && milesCountries.includes(countryCode) ? 'miles' : 'km';
}

export default useLocation;
