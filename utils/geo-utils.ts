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
