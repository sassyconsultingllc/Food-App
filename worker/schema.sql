-- Foodie Finder D1 Schema - INTERNATIONAL
-- © 2025 Sassy Consulting - A Veteran Owned Company
-- 
-- Run with: wrangler d1 execute foodie-finder --file=./worker/schema.sql
-- 
-- This schema supports worldwide postal codes with continent/country partitioning
-- for efficient queries across different regions.

-- =============================================================================
-- Postal Code Cache (renamed from zip_cache for international support)
-- =============================================================================
CREATE TABLE IF NOT EXISTS postal_cache (
  cache_key TEXT PRIMARY KEY,            -- Format: "postalCode" or "postalCode:countryCode"
  postal_code TEXT NOT NULL,             -- The actual postal code
  country_code TEXT,                      -- ISO 3166-1 alpha-2 (US, GB, DE, AU, etc.)
  continent TEXT,                         -- Continent for regional queries
  city TEXT,                              -- City name (for display)
  region TEXT,                            -- State/Province/Region
  latitude REAL,                          -- Cached coordinates
  longitude REAL,
  cached_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  sources TEXT NOT NULL,                  -- JSON array of API sources used
  restaurant_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for postal_cache
CREATE INDEX IF NOT EXISTS idx_postal_country ON postal_cache(country_code);
CREATE INDEX IF NOT EXISTS idx_postal_continent ON postal_cache(continent);
CREATE INDEX IF NOT EXISTS idx_postal_expires ON postal_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_postal_location ON postal_cache(latitude, longitude);

-- =============================================================================
-- Restaurant Cache
-- =============================================================================
CREATE TABLE IF NOT EXISTS restaurant_cache (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL,                -- References postal_cache.cache_key
  source_id TEXT,                         -- External ID from source API
  name TEXT NOT NULL,
  country_code TEXT,                      -- ISO country code for this restaurant
  latitude REAL,                          -- Restaurant coordinates
  longitude REAL,
  cuisine_type TEXT,                      -- Primary cuisine
  price_range TEXT,                       -- $, $$, $$$, $$$$
  rating_aggregated REAL,                 -- Combined rating
  data TEXT NOT NULL,                     -- Full JSON restaurant data
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (cache_key) REFERENCES postal_cache(cache_key) ON DELETE CASCADE
);

-- Indexes for restaurant_cache
CREATE INDEX IF NOT EXISTS idx_restaurant_cache_key ON restaurant_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_restaurant_source ON restaurant_cache(source_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_country ON restaurant_cache(country_code);
CREATE INDEX IF NOT EXISTS idx_restaurant_cuisine ON restaurant_cache(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_restaurant_rating ON restaurant_cache(rating_aggregated);
CREATE INDEX IF NOT EXISTS idx_restaurant_location ON restaurant_cache(latitude, longitude);

-- =============================================================================
-- Legacy Compatibility View
-- Allows old code using "zip_cache" table name to still work
-- =============================================================================
DROP VIEW IF EXISTS zip_cache;
CREATE VIEW zip_cache AS 
  SELECT 
    cache_key as zip_code,
    postal_code,
    country_code,
    cached_at,
    expires_at,
    sources
  FROM postal_cache;

-- =============================================================================
-- Continent Statistics (Materialized via trigger or scheduled job)
-- =============================================================================
CREATE TABLE IF NOT EXISTS continent_stats (
  continent TEXT PRIMARY KEY,
  postal_code_count INTEGER DEFAULT 0,
  restaurant_count INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- Pre-populate continents
INSERT OR IGNORE INTO continent_stats (continent) VALUES 
  ('north_america'),
  ('south_america'),
  ('europe'),
  ('asia'),
  ('oceania'),
  ('africa'),
  ('middle_east'),
  ('other');

-- =============================================================================
-- Country Statistics
-- =============================================================================
CREATE TABLE IF NOT EXISTS country_stats (
  country_code TEXT PRIMARY KEY,
  country_name TEXT,
  continent TEXT,
  postal_code_count INTEGER DEFAULT 0,
  restaurant_count INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Useful Queries
-- =============================================================================

-- Get all cached locations in Europe:
-- SELECT * FROM postal_cache WHERE continent = 'europe';

-- Get restaurant count by country:
-- SELECT country_code, COUNT(*) as count FROM restaurant_cache 
-- WHERE country_code IS NOT NULL GROUP BY country_code ORDER BY count DESC;

-- Get restaurants near coordinates (requires lat/lng index):
-- SELECT * FROM restaurant_cache 
-- WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?;

-- Clean up expired entries:
-- DELETE FROM postal_cache WHERE expires_at <= datetime('now');
