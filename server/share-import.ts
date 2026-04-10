/**
 * Share Import Service
 * Â© 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Handles restaurants shared from Google Maps and other apps.
 * Users share a link â†’ we extract the Place ID â†’ fetch details â†’ add to favorites.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { sharedImports, userFavorites, restaurantCache } from "@/drizzle/schema";
import { cacheSingleRestaurant, getCachedRestaurantBySourceId } from "./restaurant-cache";
import { ENV } from "./_core/env";
import { ScrapedRestaurant } from "./restaurant-scraper";
import { analyzeRestaurantSentiment, generateReviewSummary } from "./sentiment-phrases";

// Common country name to ISO code mapping
function getCountryCode(countryName: string): string {
  const countryMap: Record<string, string> = {
    'United States': 'US', 'USA': 'US', 'America': 'US',
    'United Kingdom': 'GB', 'UK': 'GB', 'Great Britain': 'GB', 'England': 'GB',
    'Canada': 'CA', 'Australia': 'AU', 'Germany': 'DE', 'France': 'FR',
    'Italy': 'IT', 'Spain': 'ES', 'Japan': 'JP', 'China': 'CN',
    'India': 'IN', 'Brazil': 'BR', 'Mexico': 'MX', 'Netherlands': 'NL',
    'Belgium': 'BE', 'Switzerland': 'CH', 'Austria': 'AT', 'Sweden': 'SE',
    'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI', 'Ireland': 'IE',
    'New Zealand': 'NZ', 'Singapore': 'SG', 'South Korea': 'KR', 'Korea': 'KR',
  };
  return countryMap[countryName] || 'US';
}

// =============================================================================
// Google Maps URL Parsing
// =============================================================================

/**
 * Extract Google Place ID from various Google Maps URL formats
 */
export function extractGooglePlaceId(url: string): string | null {
  // Format 1: maps.google.com/?cid=XXXXX
  const cidMatch = url.match(/[?&]cid=(\d+)/);
  if (cidMatch) {
    return `cid:${cidMatch[1]}`;
  }
  
  // Format 2: google.com/maps/place/.../@.../data=...!1s...
  // The place ID is after !1s in the data parameter
  const placeIdMatch = url.match(/!1s(0x[a-fA-F0-9]+:[a-fA-F0-9]+|ChIJ[A-Za-z0-9_-]+)/);
  if (placeIdMatch) {
    return placeIdMatch[1];
  }
  
  // Format 3: Direct place ID in URL path
  const pathMatch = url.match(/place_id[=:]([A-Za-z0-9_-]+)/i);
  if (pathMatch) {
    return pathMatch[1];
  }
  
  // Format 4: goo.gl/maps short URL - need to follow redirect
  if (url.includes('goo.gl/maps') || url.includes('maps.app.goo.gl')) {
    return `short:${url}`;
  }
  
  // Format 5: Plus codes or coordinates - extract for search
  const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coordMatch) {
    return `coords:${coordMatch[1]},${coordMatch[2]}`;
  }
  
  return null;
}

/**
 * Resolve a short URL to get the actual Place ID
 */
async function resolveShortUrl(shortUrl: string): Promise<string | null> {
  try {
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'follow',
    });
    
    const finalUrl = response.url;
    return extractGooglePlaceId(finalUrl);
  } catch (error) {
    console.error('[ShareImport] Failed to resolve short URL:', error);
    return null;
  }
}

// =============================================================================
// Google Place Details Fetching
// =============================================================================

/**
 * Fetch restaurant details from Google Places API using Place ID
 * This is cheaper than the Search API (~$17/1000 vs $32/1000)
 */
async function fetchGooglePlaceDetails(placeId: string): Promise<ScrapedRestaurant | null> {
  const apiKey = ENV.googlePlacesApiKey;
  if (!apiKey) {
    console.error('[ShareImport] GOOGLE_PLACES_API_KEY not set');
    return null;
  }
  
  // Handle CID (customer ID) format - need to use a different approach
  if (placeId.startsWith('cid:')) {
    return fetchGooglePlaceByCid(placeId.slice(4), apiKey);
  }
  
  // Handle coordinates - search nearby
  if (placeId.startsWith('coords:')) {
    const [lat, lng] = placeId.slice(7).split(',').map(Number);
    return fetchGooglePlaceByCoords(lat, lng, apiKey);
  }
  
  // Standard Place ID lookup
  const fields = [
    'place_id', 'name', 'formatted_address', 'formatted_phone_number',
    'website', 'rating', 'user_ratings_total', 'price_level',
    'types', 'opening_hours', 'photos', 'geometry', 'reviews',
    'address_components'
  ].join(',');
  
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[ShareImport] Google API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (data.status !== 'OK') {
      console.error('[ShareImport] Google API error:', data.status, data.error_message);
      return null;
    }
    
    return transformGooglePlaceToRestaurant(data.result, apiKey);
  } catch (error) {
    console.error('[ShareImport] Failed to fetch place details:', error);
    return null;
  }
}

/**
 * Fetch place by CID (less reliable, may need search fallback)
 */
async function fetchGooglePlaceByCid(cid: string, apiKey: string): Promise<ScrapedRestaurant | null> {
  // CID lookup requires using the Find Place endpoint
  const url = `https://maps.googleapis.com/maps/api/place/details/json?cid=${cid}&key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.result) {
      return transformGooglePlaceToRestaurant(data.result, apiKey);
    }
    
    return null;
  } catch (error) {
    console.error('[ShareImport] CID lookup failed:', error);
    return null;
  }
}

/**
 * Fetch nearest restaurant by coordinates
 */
async function fetchGooglePlaceByCoords(lat: number, lng: number, apiKey: string): Promise<ScrapedRestaurant | null> {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=50&type=restaurant&key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results?.length > 0) {
      // Get details for the first result
      const placeId = data.results[0].place_id;
      return fetchGooglePlaceDetails(placeId);
    }
    
    return null;
  } catch (error) {
    console.error('[ShareImport] Coord lookup failed:', error);
    return null;
  }
}

/**
 * Transform Google Place result to ScrapedRestaurant
 */
function transformGooglePlaceToRestaurant(place: any, apiKey: string): ScrapedRestaurant {
  // Extract address components
  const addressComponents = place.address_components || [];
  const getComponent = (type: string) => 
    addressComponents.find((c: any) => c.types.includes(type))?.short_name || '';
  
  const reviews = place.reviews?.map((r: any) => r.text).filter(Boolean) || [];
  const reviewText = reviews.join(' ');
  const sentiment = reviewText 
    ? analyzeRestaurantSentiment(reviewText)
    : { score: 0.5, sentiment: 'neutral' as const, positiveCount: 0, negativeCount: 0, summary: '', highlights: [], warnings: [] };
  
  return {
    id: `google_${place.place_id}`,
    name: place.name,
    address: place.formatted_address || '',
    city: getComponent('locality') || getComponent('administrative_area_level_2'),
    state: getComponent('administrative_area_level_1'),
    zipCode: getComponent('postal_code'),
    postalCode: getComponent('postal_code'),
    country: getComponent('country') || 'United States',
    countryCode: getComponent('country') ? getCountryCode(getComponent('country')) : 'US',
    latitude: place.geometry?.location?.lat || 0,
    longitude: place.geometry?.location?.lng || 0,
    phone: place.formatted_phone_number,
    website: place.website,
    cuisineType: extractCuisineType(place.types || []),
    priceRange: place.price_level ? '$'.repeat(place.price_level) : undefined,
    categories: place.types || [],
    ratings: {
      google: place.rating,
      googleReviewCount: place.user_ratings_total,
      aggregated: place.rating || 0,
      totalReviews: place.user_ratings_total || 0,
    },
    hours: parseGoogleHours(place.opening_hours),
    photos: place.photos?.slice(0, 10).map((p: any) =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${p.photo_reference}&key=${apiKey}`
    ) || [],
    isCulvers: place.name?.toLowerCase().includes("culver's") || false,
    sentiment,
    reviewSummary: reviews.length > 0 
      ? generateReviewSummary(reviews, place.name)
      : `${place.name} is a restaurant in ${getComponent('locality') || 'the area'}.`,
    scrapedAt: new Date().toISOString(),
    sources: ['google'],
  };
}

function extractCuisineType(types: string[]): string {
  const cuisineTypes = types.filter(t => 
    !['restaurant', 'food', 'point_of_interest', 'establishment'].includes(t)
  );
  
  if (cuisineTypes.length > 0) {
    return cuisineTypes[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  
  return 'Restaurant';
}

function parseGoogleHours(openingHours: any): Record<string, string> | undefined {
  if (!openingHours?.weekday_text) return undefined;
  
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const hours: Record<string, string> = {};
  
  openingHours.weekday_text.forEach((text: string, idx: number) => {
    const match = text.match(/:\s*(.+)$/);
    if (match && days[idx]) {
      hours[days[idx]] = match[1];
    }
  });
  
  return Object.keys(hours).length > 0 ? hours : undefined;
}

// =============================================================================
// Import Processing
// =============================================================================

export interface ImportResult {
  success: boolean;
  restaurant?: ScrapedRestaurant;
  restaurantId?: number;
  error?: string;
}

/**
 * Process a shared URL and import the restaurant
 */
export async function processSharedUrl(
  url: string,
  userId: string
): Promise<ImportResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: 'Database not available' };
  }
  
  console.log(`[ShareImport] Processing URL for user ${userId}: ${url}`);
  
  // Extract Place ID
  let placeId = extractGooglePlaceId(url);
  
  if (!placeId) {
    return { success: false, error: 'Could not extract restaurant info from URL' };
  }
  
  // Handle short URLs
  if (placeId.startsWith('short:')) {
    const resolved = await resolveShortUrl(placeId.slice(6));
    if (!resolved) {
      return { success: false, error: 'Could not resolve short URL' };
    }
    placeId = resolved;
  }
  
  const sourceId = `google_${placeId.replace(/^(cid:|coords:)/, '')}`;
  
  // Check if already in cache
  let restaurant = await getCachedRestaurantBySourceId(sourceId);
  let restaurantId: number;
  
  if (restaurant) {
    console.log(`[ShareImport] Found in cache: ${restaurant.name}`);
    
    // Get the cache ID
    const cached = await db
      .select({ id: restaurantCache.id })
      .from(restaurantCache)
      .where(eq(restaurantCache.sourceId, sourceId))
      .limit(1);
    
    restaurantId = cached[0]?.id || 0;
  } else {
    // Fetch from Google
    restaurant = await fetchGooglePlaceDetails(placeId);
    
    if (!restaurant) {
      return { success: false, error: 'Could not fetch restaurant details' };
    }
    
    console.log(`[ShareImport] Fetched from Google: ${restaurant.name}`);
    
    // Cache it
    restaurantId = await cacheSingleRestaurant(restaurant);
  }
  
  // Record the import
  await db.insert(sharedImports).values({
    externalId: placeId,
    externalSource: 'google_maps',
    originalUrl: url,
    restaurantId,
    importedBy: userId,
    status: 'resolved',
    resolvedAt: new Date(),
  });
  
  // Add to user's favorites
  const existingFavorite = await db
    .select()
    .from(userFavorites)
    .where(
      and(
        eq(userFavorites.userId, userId),
        eq(userFavorites.restaurantId, restaurantId)
      )
    )
    .limit(1);
  
  if (existingFavorite.length === 0) {
    await db.insert(userFavorites).values({
      userId,
      restaurantId,
      addedVia: 'share',
    });
    console.log(`[ShareImport] Added to favorites for user ${userId}`);
  }
  
  return {
    success: true,
    restaurant,
    restaurantId,
  };
}

/**
 * Get user's imported favorites
 */
export async function getUserFavorites(userId: string): Promise<ScrapedRestaurant[]> {
  const db = await getDb();
  if (!db) return [];
  
  const favorites = await db
    .select({
      restaurantId: userFavorites.restaurantId,
    })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId));
  
  if (favorites.length === 0) return [];
  
  const restaurantIds = favorites.map((f: { restaurantId: number }) => f.restaurantId);
  
  const { getCachedRestaurantsByIds } = await import('./restaurant-cache');
  return getCachedRestaurantsByIds(restaurantIds);
}

/**
 * Remove from favorites
 */
export async function removeFromFavorites(
  userId: string,
  restaurantId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db
    .delete(userFavorites)
    .where(
      and(
        eq(userFavorites.userId, userId),
        eq(userFavorites.restaurantId, restaurantId)
      )
    );
  
  return true;
}
