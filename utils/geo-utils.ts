// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-3EHM3USYEMIP
/**
 * Geo Utilities - INTERNATIONAL
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Re-exports from geo-service for backward compatibility
 * and provides additional client-side utilities.
 */

// Re-export everything from geo-service
export {
  calculateDistance,
  geocodePostalCode,
  reverseGeocode,
  milesToKm,
  kmToMiles,
  toMeters,
  getDefaultDistanceUnit,
  formatDistance,
  isValidPostalCode,
  getPostalCodePattern,
  type GeoCoordinates,
  type GeoLocation,
  type DistanceUnit,
} from './geo-service';

// Legacy export for backward compatibility (empty - use geocodePostalCode instead)
export const ZIP_CODE_COORDS: Record<string, { lat: number; lon: number }> = {};

/** Latitude/longitude pair used as a distance reference point */
export type LatLon = { lat: number; lon: number };

/**
 * Derive a search-area center from loaded restaurant results (no network).
 * Uses the centroid of restaurants with valid coordinates — appropriate
 * because results are already scoped to the active postal-code search.
 */
export function deriveSearchCenterFromRestaurants(
  restaurants: ReadonlyArray<{ latitude?: number | null; longitude?: number | null }>
): LatLon | null {
  const withCoords = restaurants.filter(
    (r) =>
      typeof r.latitude === "number" &&
      typeof r.longitude === "number" &&
      !Number.isNaN(r.latitude) &&
      !Number.isNaN(r.longitude)
  );
  if (withCoords.length === 0) return null;

  const lat =
    withCoords.reduce((sum, r) => sum + r.latitude!, 0) / withCoords.length;
  const lon =
    withCoords.reduce((sum, r) => sum + r.longitude!, 0) / withCoords.length;
  return { lat, lon };
}

/** Priority: search results centroid → geocoded zip → device GPS */
export function pickSearchCenter(
  fromRestaurants: LatLon | null,
  geocodedZip: LatLon | null,
  gps: LatLon | null
): LatLon | null {
  return fromRestaurants ?? geocodedZip ?? gps ?? null;
}
