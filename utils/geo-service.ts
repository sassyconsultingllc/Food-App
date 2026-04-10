/**
 * International Geo Service
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Provides geocoding and distance calculations for worldwide locations.
 * No country restrictions - works with any postal code globally.
 */

export interface GeoCoordinates {
  lat: number;
  lng: number;
  displayName?: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
}

export interface GeoLocation {
  postalCode: string;
  coordinates: GeoCoordinates;
  country: string;
  countryCode: string;  // ISO 3166-1 alpha-2
  region?: string;      // State/Province/Region
  city?: string;
  continent?: string;
}

// Distance units
export type DistanceUnit = 'miles' | 'km';

// Earth's radius
const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_MILES = 3959;

// In-memory cache for geocoded locations (reduces API calls)
const geocodeCache = new Map<string, GeoLocation>();

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in specified unit (default: miles for backward compatibility)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: DistanceUnit = 'miles'
): number {
  const R = unit === 'km' ? EARTH_RADIUS_KM : EARTH_RADIUS_MILES;
  
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert miles to kilometers
 */
export function milesToKm(miles: number): number {
  return miles * 1.60934;
}

/**
 * Convert kilometers to miles
 */
export function kmToMiles(km: number): number {
  return km / 1.60934;
}

/**
 * Convert radius to meters (for API calls)
 */
export function toMeters(distance: number, unit: DistanceUnit): number {
  const km = unit === 'km' ? distance : milesToKm(distance);
  return Math.round(km * 1000);
}

/**
 * Geocode a postal code to coordinates - INTERNATIONAL
 * Uses Nominatim (OpenStreetMap) - free, no API key, works worldwide
 * 
 * @param postalCode - Any postal code worldwide (ZIP, postcode, PLZ, etc.)
 * @param countryCode - Optional ISO 3166-1 alpha-2 country code to narrow search
 */
export async function geocodePostalCode(
  postalCode: string,
  countryCode?: string
): Promise<GeoLocation | null> {
  // Clean the postal code
  const cleanPostal = postalCode.trim().toUpperCase();
  const cacheKey = countryCode ? `${cleanPostal}:${countryCode}` : cleanPostal;
  
  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }
  
  try {
    // Build Nominatim URL - NO country restriction by default
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('postalcode', cleanPostal);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    
    // Only add country filter if explicitly provided
    if (countryCode) {
      url.searchParams.set('countrycodes', countryCode.toLowerCase());
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'FoodieFinder/2.0 (International) contact@sassyconsultingllc.com',
      },
    });
    
    if (!response.ok) {
      console.error(`[GeoService] Nominatim error: ${response.status}`);
      return null;
    }
    
    const data = await response.json() as any[];
    
    if (data.length === 0) {
      console.log(`[GeoService] No results for postal code: ${cleanPostal}`);
      return null;
    }
    
    const result = data[0];
    const address = result.address || {};
    
    const location: GeoLocation = {
      postalCode: cleanPostal,
      coordinates: {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        city: address.city || address.town || address.village || address.municipality,
        state: address.state || address.province || address.region,
        country: address.country,
        countryCode: address.country_code?.toUpperCase(),
      },
      country: address.country || 'Unknown',
      countryCode: address.country_code?.toUpperCase() || 'XX',
      region: address.state || address.province || address.region,
      city: address.city || address.town || address.village || address.municipality,
      continent: getContinent(address.country_code?.toUpperCase()),
    };
    
    // Cache the result
    geocodeCache.set(cacheKey, location);
    
    return location;
  } catch (error) {
    console.error('[GeoService] Geocoding error:', error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to location info
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoLocation | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', lat.toString());
    url.searchParams.set('lon', lng.toString());
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'FoodieFinder/2.0 (International) contact@sassyconsultingllc.com',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const result = await response.json() as any;
    const address = result.address || {};
    
    return {
      postalCode: address.postcode || '',
      coordinates: {
        lat,
        lng,
        displayName: result.display_name,
        city: address.city || address.town || address.village,
        state: address.state || address.province || address.region,
        country: address.country,
        countryCode: address.country_code?.toUpperCase(),
      },
      country: address.country || 'Unknown',
      countryCode: address.country_code?.toUpperCase() || 'XX',
      region: address.state || address.province || address.region,
      city: address.city || address.town || address.village,
      continent: getContinent(address.country_code?.toUpperCase()),
    };
  } catch (error) {
    console.error('[GeoService] Reverse geocoding error:', error);
    return null;
  }
}

/**
 * Get continent from country code
 */
function getContinent(countryCode?: string): string | undefined {
  if (!countryCode) return undefined;
  
  const continentMap: Record<string, string> = {
    // North America
    US: 'north_america', CA: 'north_america', MX: 'north_america',
    // Europe
    GB: 'europe', UK: 'europe', DE: 'europe', FR: 'europe', IT: 'europe',
    ES: 'europe', PT: 'europe', NL: 'europe', BE: 'europe', AT: 'europe',
    CH: 'europe', SE: 'europe', NO: 'europe', DK: 'europe', FI: 'europe',
    PL: 'europe', CZ: 'europe', IE: 'europe', GR: 'europe', HU: 'europe',
    // Asia Pacific
    AU: 'oceania', NZ: 'oceania',
    JP: 'asia', CN: 'asia', KR: 'asia', IN: 'asia', SG: 'asia',
    TH: 'asia', MY: 'asia', PH: 'asia', ID: 'asia', VN: 'asia',
    // South America
    BR: 'south_america', AR: 'south_america', CL: 'south_america',
    CO: 'south_america', PE: 'south_america',
    // Africa
    ZA: 'africa', EG: 'africa', NG: 'africa', KE: 'africa', MA: 'africa',
    // Middle East
    AE: 'middle_east', SA: 'middle_east', IL: 'middle_east', TR: 'middle_east',
  };
  
  return continentMap[countryCode] || 'other';
}

/**
 * Determine default distance unit based on country
 */
export function getDefaultDistanceUnit(countryCode?: string): DistanceUnit {
  // Countries using miles: US, UK, Myanmar, Liberia
  const milesCountries = ['US', 'GB', 'UK', 'MM', 'LR'];
  return countryCode && milesCountries.includes(countryCode) ? 'miles' : 'km';
}

/**
 * Format distance for display with appropriate unit
 */
export function formatDistance(
  distance: number,
  unit: DistanceUnit,
  precision: number = 1
): string {
  return `${distance.toFixed(precision)} ${unit}`;
}

/**
 * Validate postal code format (basic validation)
 * Returns true for any non-empty string - specific validation should be done per country
 */
export function isValidPostalCode(postalCode: string): boolean {
  const cleaned = postalCode.trim();
  // Allow 2-10 characters (covers most international formats)
  return cleaned.length >= 2 && cleaned.length <= 10;
}

/**
 * Get postal code regex pattern by country (for client-side validation)
 */
export function getPostalCodePattern(countryCode: string): RegExp {
  const patterns: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/,           // 12345 or 12345-6789
    CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, // A1A 1A1
    GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, // SW1A 1AA
    UK: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
    DE: /^\d{5}$/,                     // 12345
    FR: /^\d{5}$/,
    AU: /^\d{4}$/,                     // 1234
    JP: /^\d{3}-?\d{4}$/,              // 123-4567
    NL: /^\d{4} ?[A-Z]{2}$/i,          // 1234 AB
    BR: /^\d{5}-?\d{3}$/,              // 12345-678
    IN: /^\d{6}$/,                     // 123456
  };
  
  return patterns[countryCode] || /.+/; // Default: any non-empty string
}

// Legacy export for backward compatibility
export const ZIP_CODE_COORDS: Record<string, { lat: number; lon: number }> = {};

export default {
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
};
