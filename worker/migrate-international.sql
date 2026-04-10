-- Foodie Finder D1 Migration: US-only → International
-- © 2025 Sassy Consulting - A Veteran Owned Company
-- 
-- Run with: wrangler d1 execute foodie-finder --file=./worker/migrate-international.sql
--
-- This migration upgrades the schema from US ZIP codes to international postal codes

-- =============================================================================
-- Step 1: Create new postal_cache table
-- =============================================================================
CREATE TABLE IF NOT EXISTS postal_cache (
  cache_key TEXT PRIMARY KEY,
  postal_code TEXT NOT NULL,
  country_code TEXT,
  continent TEXT,
  city TEXT,
  region TEXT,
  latitude REAL,
  longitude REAL,
  cached_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  sources TEXT NOT NULL,
  restaurant_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Step 2: Migrate data from old zip_cache to new postal_cache
-- =============================================================================
INSERT OR IGNORE INTO postal_cache (cache_key, postal_code, country_code, continent, cached_at, expires_at, sources, restaurant_count)
SELECT 
  zip_code || ':US' as cache_key,
  zip_code as postal_code,
  'US' as country_code,
  'north_america' as continent,
  cached_at,
  expires_at,
  sources,
  0 as restaurant_count
FROM zip_cache
WHERE zip_code IS NOT NULL;

-- =============================================================================
-- Step 3: Create new restaurant_cache_v2 table with cache_key
-- =============================================================================
CREATE TABLE IF NOT EXISTS restaurant_cache_v2 (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL,
  source_id TEXT,
  name TEXT NOT NULL,
  country_code TEXT,
  latitude REAL,
  longitude REAL,
  cuisine_type TEXT,
  price_range TEXT,
  rating_aggregated REAL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Step 4: Migrate restaurant data
-- =============================================================================
INSERT OR IGNORE INTO restaurant_cache_v2 (id, cache_key, source_id, name, country_code, data, created_at)
SELECT 
  id,
  zip_code || ':US' as cache_key,
  source_id,
  name,
  'US' as country_code,
  data,
  created_at
FROM restaurant_cache
WHERE zip_code IS NOT NULL;

-- =============================================================================
-- Step 5: Drop old tables and rename new ones
-- =============================================================================
DROP TABLE IF EXISTS restaurant_cache;
ALTER TABLE restaurant_cache_v2 RENAME TO restaurant_cache;

-- Keep zip_cache as a view for backward compatibility
DROP TABLE IF EXISTS zip_cache;
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
-- Step 6: Create indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_postal_country ON postal_cache(country_code);
CREATE INDEX IF NOT EXISTS idx_postal_continent ON postal_cache(continent);
CREATE INDEX IF NOT EXISTS idx_postal_expires ON postal_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_restaurant_cache_key ON restaurant_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_restaurant_source ON restaurant_cache(source_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_country ON restaurant_cache(country_code);

-- =============================================================================
-- Step 7: Create stats tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS continent_stats (
  continent TEXT PRIMARY KEY,
  postal_code_count INTEGER DEFAULT 0,
  restaurant_count INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO continent_stats (continent) VALUES 
  ('north_america'),
  ('south_america'),
  ('europe'),
  ('asia'),
  ('oceania'),
  ('africa'),
  ('middle_east'),
  ('other');

-- Done!
SELECT 'Migration complete! Postal codes: ' || COUNT(*) FROM postal_cache;
