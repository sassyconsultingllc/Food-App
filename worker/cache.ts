/**
 * D1 Cache for Restaurant Data - INTERNATIONAL
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Supports worldwide postal codes with optional country partitioning
 */

import { D1Database } from '@cloudflare/workers-types';

export interface CachedRestaurant {
  id: string;
  postal_code: string;     // Can include country: "12345:US" or "SW1A 1AA:GB"
  data: string;            // JSON stringified ScrapedRestaurant
  created_at: string;
  expires_at: string;
}

const CACHE_TTL_HOURS = 24;

/**
 * Initialize cache tables with international support
 */
export async function initCacheTables(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS postal_cache (
      cache_key TEXT PRIMARY KEY,
      postal_code TEXT NOT NULL,
      country_code TEXT,
      continent TEXT,
      cached_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      sources TEXT NOT NULL,
      restaurant_count INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS restaurant_cache (
      id TEXT PRIMARY KEY,
      cache_key TEXT NOT NULL,
      source_id TEXT,
      name TEXT NOT NULL,
      country_code TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (cache_key) REFERENCES postal_cache(cache_key)
    );
    
    CREATE INDEX IF NOT EXISTS idx_restaurant_cache_key ON restaurant_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_restaurant_source ON restaurant_cache(source_id);
    CREATE INDEX IF NOT EXISTS idx_restaurant_country ON restaurant_cache(country_code);
    CREATE INDEX IF NOT EXISTS idx_postal_country ON postal_cache(country_code);
    CREATE INDEX IF NOT EXISTS idx_postal_continent ON postal_cache(continent);
    
    -- Legacy compatibility: create view for old zip_cache table name
    CREATE VIEW IF NOT EXISTS zip_cache AS 
      SELECT cache_key as zip_code, postal_code, cached_at, expires_at, sources 
      FROM postal_cache;
  `);
}

/**
 * Check if postal code data is cached and not expired
 * @param cacheKey - Format: "postalCode" or "postalCode:countryCode"
 */
export async function isPostalCodeCached(db: D1Database, cacheKey: string): Promise<boolean> {
  try {
    const result = await db.prepare(
      `SELECT expires_at FROM postal_cache WHERE cache_key = ? AND expires_at > datetime('now')`
    ).bind(cacheKey).first<{ expires_at: string }>();
    
    return !!result;
  } catch (e) {
    console.error("[Cache] isPostalCodeCached error:", e);
    return false;
  }
}

// Legacy alias
export const isZipCached = isPostalCodeCached;

/**
 * Get cached restaurants for a postal code
 * @param cacheKey - Format: "postalCode" or "postalCode:countryCode"
 */
export async function getCachedRestaurants(db: D1Database, cacheKey: string): Promise<any[]> {
  try {
    const results = await db.prepare(
      `SELECT data FROM restaurant_cache WHERE cache_key = ?`
    ).bind(cacheKey).all<{ data: string }>();
    
    if (!results.results) return [];
    
    return results.results.map(r => {
      try {
        return JSON.parse(r.data);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.error("[Cache] getCachedRestaurants error:", e);
    return [];
  }
}

/**
 * Extract components from cache key
 */
function parseCacheKey(cacheKey: string): { postalCode: string; countryCode?: string } {
  const parts = cacheKey.split(':');
  return {
    postalCode: parts[0],
    countryCode: parts[1],
  };
}

/**
 * Determine continent from country code
 */
function getContinent(countryCode?: string): string | null {
  if (!countryCode) return null;
  
  const continentMap: Record<string, string> = {
    // North America
    US: 'north_america', CA: 'north_america', MX: 'north_america',
    // Europe
    GB: 'europe', UK: 'europe', DE: 'europe', FR: 'europe', IT: 'europe',
    ES: 'europe', PT: 'europe', NL: 'europe', BE: 'europe', AT: 'europe',
    CH: 'europe', SE: 'europe', NO: 'europe', DK: 'europe', FI: 'europe',
    PL: 'europe', CZ: 'europe', IE: 'europe', GR: 'europe',
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
  
  return continentMap[countryCode.toUpperCase()] || 'other';
}

/**
 * Cache restaurants for a postal code
 * @param cacheKey - Format: "postalCode" or "postalCode:countryCode"
 */
export async function cacheRestaurants(
  db: D1Database,
  cacheKey: string,
  restaurants: any[],
  sources: string[]
): Promise<void> {
  if (restaurants.length === 0) return;
  
  try {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { postalCode, countryCode } = parseCacheKey(cacheKey);
    const continent = getContinent(countryCode);
    
    // Upsert postal_cache entry
    await db.prepare(`
      INSERT INTO postal_cache (cache_key, postal_code, country_code, continent, cached_at, expires_at, sources, restaurant_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at,
        sources = excluded.sources,
        restaurant_count = excluded.restaurant_count
    `).bind(cacheKey, postalCode, countryCode || null, continent, now, expiresAt, JSON.stringify(sources), restaurants.length).run();
    
    // Delete old restaurants for this cache key
    await db.prepare(`DELETE FROM restaurant_cache WHERE cache_key = ?`).bind(cacheKey).run();
    
    // Batch insert restaurants
    const stmt = db.prepare(`
      INSERT INTO restaurant_cache (id, cache_key, source_id, name, country_code, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const batch = restaurants.map(r => 
      stmt.bind(
        r.id,
        cacheKey,
        r.sources?.[0] ? `${r.sources[0]}_${r.id}` : r.id,
        r.name,
        r.countryCode || countryCode || null,
        JSON.stringify(r),
        now
      )
    );
    
    // D1 batch limit is 100, so chunk if needed
    const chunkSize = 100;
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize);
      await db.batch(chunk);
    }
    
    console.log(`[Cache] Cached ${restaurants.length} restaurants for ${cacheKey}`);
  } catch (e) {
    console.error("[Cache] cacheRestaurants error:", e);
  }
}

/**
 * Get cache statistics with international breakdown
 */
export async function getCacheStats(db: D1Database): Promise<{
  postalCodesCount: number;
  restaurantsCount: number;
  oldestCache: string | null;
  newestCache: string | null;
  byContinent?: Record<string, number>;
}> {
  try {
    // Get basic counts
    const postalCount = await db.prepare(
      `SELECT COUNT(*) as count FROM postal_cache WHERE expires_at > datetime('now')`
    ).first<{ count: number }>();
    
    const restaurantCount = await db.prepare(
      `SELECT COUNT(*) as count FROM restaurant_cache`
    ).first<{ count: number }>();
    
    const oldest = await db.prepare(
      `SELECT cached_at FROM postal_cache ORDER BY cached_at ASC LIMIT 1`
    ).first<{ cached_at: string }>();
    
    const newest = await db.prepare(
      `SELECT cached_at FROM postal_cache ORDER BY cached_at DESC LIMIT 1`
    ).first<{ cached_at: string }>();
    
    // Get breakdown by continent
    const continentResults = await db.prepare(
      `SELECT continent, COUNT(*) as count FROM postal_cache 
       WHERE expires_at > datetime('now') AND continent IS NOT NULL
       GROUP BY continent`
    ).all<{ continent: string; count: number }>();
    
    const byContinent: Record<string, number> = {};
    if (continentResults.results) {
      for (const row of continentResults.results) {
        byContinent[row.continent] = row.count;
      }
    }
    
    return {
      postalCodesCount: postalCount?.count || 0,
      restaurantsCount: restaurantCount?.count || 0,
      oldestCache: oldest?.cached_at || null,
      newestCache: newest?.cached_at || null,
      byContinent,
    };
  } catch (e) {
    console.error("[Cache] getCacheStats error:", e);
    return {
      postalCodesCount: 0,
      restaurantsCount: 0,
      oldestCache: null,
      newestCache: null,
    };
  }
}

/**
 * Get restaurants by country (for analytics/admin)
 */
export async function getRestaurantsByCountry(
  db: D1Database, 
  countryCode: string,
  limit: number = 100
): Promise<any[]> {
  try {
    const results = await db.prepare(
      `SELECT data FROM restaurant_cache WHERE country_code = ? LIMIT ?`
    ).bind(countryCode.toUpperCase(), limit).all<{ data: string }>();
    
    if (!results.results) return [];
    
    return results.results.map(r => {
      try {
        return JSON.parse(r.data);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.error("[Cache] getRestaurantsByCountry error:", e);
    return [];
  }
}

/**
 * Get restaurants by continent (for analytics/admin)
 */
export async function getRestaurantsByContinent(
  db: D1Database, 
  continent: string,
  limit: number = 100
): Promise<any[]> {
  try {
    const results = await db.prepare(`
      SELECT rc.data 
      FROM restaurant_cache rc
      JOIN postal_cache pc ON rc.cache_key = pc.cache_key
      WHERE pc.continent = ?
      LIMIT ?
    `).bind(continent, limit).all<{ data: string }>();
    
    if (!results.results) return [];
    
    return results.results.map(r => {
      try {
        return JSON.parse(r.data);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.error("[Cache] getRestaurantsByContinent error:", e);
    return [];
  }
}

/**
 * Clear expired cache entries
 */
export async function cleanupExpiredCache(db: D1Database): Promise<number> {
  try {
    // First delete restaurants for expired postal codes
    await db.prepare(`
      DELETE FROM restaurant_cache 
      WHERE cache_key IN (
        SELECT cache_key FROM postal_cache WHERE expires_at <= datetime('now')
      )
    `).run();
    
    // Then delete the expired postal codes
    const result = await db.prepare(
      `DELETE FROM postal_cache WHERE expires_at <= datetime('now')`
    ).run();
    
    const deleted = result.meta?.changes || 0;
    console.log(`[Cache] Cleaned up ${deleted} expired cache entries`);
    return deleted;
  } catch (e) {
    console.error("[Cache] cleanupExpiredCache error:", e);
    return 0;
  }
}
