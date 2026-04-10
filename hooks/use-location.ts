/**
 * GPS Location Hook - INTERNATIONAL
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Provides GPS location detection and reverse geocoding to postal code
 * Works worldwide - no country restrictions
 */

import * as Location from "expo-location";
import { useState, useCallback } from "react";

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

/**
 * Reverse geocode coordinates to location info using Nominatim (free, worldwide)
 */
async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<{
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
}> {
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
    console.error('[Location] Reverse geocoding error:', error);
    return { postalCode: null, city: null, state: null, country: null, countryCode: null };
  }
}

/**
 * Hook for getting user's GPS location with reverse geocoding
 */
export function useLocation() {
  const [location, setLocation] = useState<LocationState>(initialState);

  const requestLocation = useCallback(async () => {
    setLocation((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      setLocation((prev) => ({ ...prev, permissionStatus: status }));

      if (status !== "granted") {
        setLocation((prev) => ({
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

      const { latitude, longitude } = position.coords;

      // Reverse geocode to get postal code and location info
      const geoResult = await reverseGeocode(latitude, longitude);

      setLocation({
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
      console.error("[Location] Error getting location:", error);
      setLocation((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to get location",
      }));
    }
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(initialState);
  }, []);

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
