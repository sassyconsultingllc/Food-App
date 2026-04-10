/**
 * Restaurant Cache Service
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Manages shared restaurant cache to minimize API costs.
 * When a user searches a zip code, results are cached for ALL users.
 */

import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { restaurantCache, zipCodeCache, InsertCachedRestaurant, CachedRestaurant } from "@/drizzle/schema";
import { ScrapedRestaurant } from "./restaurant-scraper";
import { SentimentResult } from "./types";

// Cache duration: 7 days for restaurant data
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Minimum time between re-scraping a zip code: 24 hours
const MIN_RESCRAPE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Check if a zip code has been recently scraped
 */
export async function isZipCodeCached(zipCode: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const cutoff = new Date(Date.now() - MIN_RESCRAPE_INTERVAL_MS);
  
  const result = await db
    .select()
    .from(zipCodeCache)
    .where(
      and(
        eq(zipCodeCache.zipCode, zipCode),
        gte(zipCodeCache.lastScrapedAt, cutoff)
      )
    )
    .limit(1);
  
  return result.length > 0;
}

/**
 * Get cached restaurants for a zip code
 */
export async function getCachedRestaurants(
  zipCode: string,
  radiusMiles: number = 10
): Promise<ScrapedRestaurant[]> {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db
    .select()
    .from(restaurantCache)
    .where(eq(restaurantCache.zipCode, zipCode))
    .limit(100);
  
  return results.map(transformCacheToRestaurant);
}

/**
 * Get cached restaurants by IDs
 */
export async function getCachedRestaurantsByIds(
  ids: number[]
): Promise<ScrapedRestaurant[]> {
  if (ids.length === 0) return [];
  
  const db = await getDb();
  if (!db) return [];
  
  const results = await db
    .select()
    .from(restaurantCache)
    .where(inArray(restaurantCache.id, ids));
  
  return results.map(transformCacheToRestaurant);
}

/**
 * Get a single cached restaurant by source ID
 */
export async function getCachedRestaurantBySourceId(
  sourceId: string
): Promise<ScrapedRestaurant | null> {
  const db = await getDb();
  if (!db) return null;
  
  const results = await db
    .select()
    .from(restaurantCache)
    .where(eq(restaurantCache.sourceId, sourceId))
    .limit(1);
  
  if (results.length === 0) return null;
  return transformCacheToRestaurant(results[0]);
}

/**
 * Cache restaurants from a scrape
 */
export async function cacheRestaurants(
  zipCode: string,
  restaurants: ScrapedRestaurant[],
  sourcesUsed: string[]
): Promise<void> {
  if (restaurants.length === 0) return;
  
  const db = await getDb();
  if (!db) {
    console.warn('[Cache] Database not available');
    return;
  }
  
  // Upsert each restaurant
  for (const restaurant of restaurants) {
    const cacheRecord: InsertCachedRestaurant = {
      sourceId: restaurant.id,
      primarySource: restaurant.sources[0] || 'unknown',
      name: restaurant.name,
      address: restaurant.address,
      city: restaurant.city,
      state: restaurant.state,
      zipCode: restaurant.zipCode || zipCode,
      latitude: restaurant.latitude?.toString(),
      longitude: restaurant.longitude?.toString(),
      phone: restaurant.phone,
      website: restaurant.website,
      cuisineType: restaurant.cuisineType,
      priceRange: restaurant.priceRange,
      categories: restaurant.categories,
      ratings: restaurant.ratings,
      hours: restaurant.hours,
      photos: restaurant.photos,
      isCulvers: restaurant.isCulvers || false,
      sentiment: restaurant.sentiment,
      reviewSummary: restaurant.reviewSummary,
      allSources: restaurant.sources,
      lastVerified: new Date(),
    };
    
    try {
      await db
        .insert(restaurantCache)
        .values(cacheRecord)
        .onDuplicateKeyUpdate({
          set: {
            name: cacheRecord.name,
            address: cacheRecord.address,
            ratings: cacheRecord.ratings,
            hours: cacheRecord.hours,
            photos: cacheRecord.photos,
            sentiment: cacheRecord.sentiment,
            reviewSummary: cacheRecord.reviewSummary,
            allSources: cacheRecord.allSources,
            lastVerified: new Date(),
          },
        });
    } catch (error) {
      console.error(`[Cache] Failed to cache restaurant ${restaurant.name}:`, error);
    }
  }
  
  // Update zip code cache record
  await db
    .insert(zipCodeCache)
    .values({
      zipCode,
      restaurantCount: restaurants.length,
      sourcesUsed,
      lastScrapedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        restaurantCount: restaurants.length,
        sourcesUsed,
        lastScrapedAt: new Date(),
      },
    });
  
  console.log(`[Cache] Cached ${restaurants.length} restaurants for zip ${zipCode}`);
}

/**
 * Cache a single restaurant (from share import)
 */
export async function cacheSingleRestaurant(
  restaurant: ScrapedRestaurant
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const cacheRecord: InsertCachedRestaurant = {
    sourceId: restaurant.id,
    primarySource: restaurant.sources[0] || 'google',
    name: restaurant.name,
    address: restaurant.address,
    city: restaurant.city,
    state: restaurant.state,
    zipCode: restaurant.zipCode,
    latitude: restaurant.latitude?.toString(),
    longitude: restaurant.longitude?.toString(),
    phone: restaurant.phone,
    website: restaurant.website,
    cuisineType: restaurant.cuisineType,
    priceRange: restaurant.priceRange,
    categories: restaurant.categories,
    ratings: restaurant.ratings,
    hours: restaurant.hours,
    photos: restaurant.photos,
    isCulvers: restaurant.isCulvers || false,
    sentiment: restaurant.sentiment,
    reviewSummary: restaurant.reviewSummary,
    allSources: restaurant.sources,
    lastVerified: new Date(),
  };
  
  await db
    .insert(restaurantCache)
    .values(cacheRecord)
    .onDuplicateKeyUpdate({
      set: {
        name: cacheRecord.name,
        address: cacheRecord.address,
        ratings: cacheRecord.ratings,
        lastVerified: new Date(),
      },
    });
  
  // Get the inserted/updated ID
  const existing = await db
    .select({ id: restaurantCache.id })
    .from(restaurantCache)
    .where(eq(restaurantCache.sourceId, restaurant.id))
    .limit(1);
  
  return existing[0]?.id || 0;
}

/**
 * Transform cache record back to ScrapedRestaurant
 */
function transformCacheToRestaurant(cache: CachedRestaurant): ScrapedRestaurant {
  const defaultSentiment: SentimentResult = {
    score: 0.5,
    sentiment: 'neutral',
    positiveCount: 0,
    negativeCount: 0,
    summary: '',
    highlights: [],
    warnings: [],
  };
  
  return {
    id: cache.sourceId,
    name: cache.name,
    address: cache.address || '',
    city: cache.city || '',
    state: cache.state || '',
    zipCode: cache.zipCode || '',
    postalCode: cache.zipCode || '',  // International alias
    country: '',                       // Not stored in cache yet
    countryCode: '',                   // Not stored in cache yet
    latitude: cache.latitude ? parseFloat(cache.latitude) : 0,
    longitude: cache.longitude ? parseFloat(cache.longitude) : 0,
    phone: cache.phone || undefined,
    website: cache.website || undefined,
    cuisineType: cache.cuisineType || 'Restaurant',
    priceRange: cache.priceRange || undefined,
    categories: cache.categories || [],
    ratings: cache.ratings || { aggregated: 0, totalReviews: 0 },
    hours: cache.hours || undefined,
    photos: cache.photos || [],
    isCulvers: cache.isCulvers || false,
    sentiment: (cache.sentiment as SentimentResult) || defaultSentiment,
    reviewSummary: cache.reviewSummary || '',
    scrapedAt: cache.updatedAt?.toISOString() || new Date().toISOString(),
    sources: cache.allSources || [cache.primarySource],
  };
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalRestaurants: number;
  totalZipCodes: number;
  oldestCache: Date | null;
}> {
  const db = await getDb();
  if (!db) {
    return { totalRestaurants: 0, totalZipCodes: 0, oldestCache: null };
  }
  
  const [restaurantCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(restaurantCache);
  
  const [zipCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(zipCodeCache);
  
  const [oldest] = await db
    .select({ oldest: sql<Date>`min(lastVerified)` })
    .from(restaurantCache);
  
  return {
    totalRestaurants: restaurantCount?.count || 0,
    totalZipCodes: zipCount?.count || 0,
    oldestCache: oldest?.oldest || null,
  };
}
