import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, decimal, boolean, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// =============================================================================
// Restaurant Cache - Shared across all users
// =============================================================================

export const restaurantCache = mysqlTable("restaurant_cache", {
  id: int("id").autoincrement().primaryKey(),
  
  // Unique identifier from source (e.g., "google_ChIJ...", "fsq_4b5...")
  sourceId: varchar("sourceId", { length: 128 }).notNull().unique(),
  
  // Primary source that provided this data
  primarySource: varchar("primarySource", { length: 32 }).notNull(), // google, foursquare, here, osm, culvers
  
  // Basic info
  name: varchar("name", { length: 256 }).notNull(),
  address: varchar("address", { length: 512 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  zipCode: varchar("zipCode", { length: 10 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Contact
  phone: varchar("phone", { length: 32 }),
  website: varchar("website", { length: 512 }),
  
  // Classification
  cuisineType: varchar("cuisineType", { length: 128 }),
  priceRange: varchar("priceRange", { length: 8 }),
  categories: json("categories").$type<string[]>(),
  
  // Ratings - stored as JSON for flexibility
  ratings: json("ratings").$type<{
    google?: number;
    googleReviewCount?: number;
    foursquare?: number;
    foursquareReviewCount?: number;
    here?: number;
    hereReviewCount?: number;
    aggregated: number;
    totalReviews: number;
  }>(),
  
  // Additional data
  hours: json("hours").$type<Record<string, string>>(),
  photos: json("photos").$type<string[]>(),
  
  // Culver's specific
  isCulvers: boolean("isCulvers").default(false),
  
  // Sentiment analysis results
  sentiment: json("sentiment").$type<{
    score: number;
    sentiment: string;
    summary: string;
    highlights: string[];
    warnings: string[];
  }>(),
  reviewSummary: text("reviewSummary"),
  
  // All sources that contributed to this record
  allSources: json("allSources").$type<string[]>(),
  
  // Cache management
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastVerified: timestamp("lastVerified").defaultNow().notNull(),
  
}, (table) => ({
  // Index for fast zip code lookups
  zipCodeIdx: index("zipCode_idx").on(table.zipCode),
  // Index for location-based queries
  locationIdx: index("location_idx").on(table.latitude, table.longitude),
  // Index for cuisine filtering
  cuisineIdx: index("cuisine_idx").on(table.cuisineType),
}));

export type CachedRestaurant = typeof restaurantCache.$inferSelect;
export type InsertCachedRestaurant = typeof restaurantCache.$inferInsert;

// =============================================================================
// Zip Code Cache - Track which zip codes have been scraped
// =============================================================================

export const zipCodeCache = mysqlTable("zipcode_cache", {
  id: int("id").autoincrement().primaryKey(),
  zipCode: varchar("zipCode", { length: 10 }).notNull().unique(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  
  // Track scraping status
  lastScrapedAt: timestamp("lastScrapedAt"),
  restaurantCount: int("restaurantCount").default(0),
  
  // Sources that were used
  sourcesUsed: json("sourcesUsed").$type<string[]>(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ZipCodeCache = typeof zipCodeCache.$inferSelect;

// =============================================================================
// User Favorites - Personal restaurant lists
// =============================================================================

export const userFavorites = mysqlTable("user_favorites", {
  id: int("id").autoincrement().primaryKey(),
  
  // Can be a registered user or anonymous device ID
  userId: varchar("userId", { length: 128 }).notNull(),
  
  // Reference to cached restaurant
  restaurantId: int("restaurantId").notNull(),
  
  // User's personal notes
  notes: text("notes"),
  
  // How they added it
  addedVia: varchar("addedVia", { length: 32 }), // 'share', 'search', 'manual'
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("user_idx").on(table.userId),
  restaurantIdx: index("restaurant_idx").on(table.restaurantId),
}));

export type UserFavorite = typeof userFavorites.$inferSelect;

// =============================================================================
// Shared Restaurants - Imported via Google Maps share
// =============================================================================

export const sharedImports = mysqlTable("shared_imports", {
  id: int("id").autoincrement().primaryKey(),
  
  // The Google Place ID or other external ID
  externalId: varchar("externalId", { length: 256 }).notNull(),
  externalSource: varchar("externalSource", { length: 32 }).notNull(), // 'google_maps', 'yelp', etc.
  
  // Original shared URL
  originalUrl: varchar("originalUrl", { length: 1024 }),
  
  // Reference to the cached restaurant (once resolved)
  restaurantId: int("restaurantId"),
  
  // Who imported it
  importedBy: varchar("importedBy", { length: 128 }).notNull(),
  
  // Status
  status: varchar("status", { length: 32 }).default("pending"), // pending, resolved, failed
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
}, (table) => ({
  externalIdx: index("external_idx").on(table.externalId, table.externalSource),
}));

export type SharedImport = typeof sharedImports.$inferSelect;
