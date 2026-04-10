/**
 * Restaurant API Router - INTERNATIONAL + AI-POWERED
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * This local development router mirrors the Cloudflare Worker interface.
 * In production, requests go directly to the Worker.
 */

import { z } from "zod";
import { publicProcedure, router, adminProcedure } from "./_core/trpc";
import {
  scrapeRestaurantsByLocation,
  fetchCulversFlavorOfTheDay,
  ScrapedRestaurant,
} from "./restaurant-scraper";
import {
  isZipCodeCached,
  getCachedRestaurants,
  cacheRestaurants,
  getCacheStats,
} from "./restaurant-cache";
import { getDatabaseStatus } from "./db";
import {
  processSharedUrl,
  getUserFavorites,
  removeFromFavorites,
} from "./share-import";
import { analyzeRestaurantSentiment, generateReviewSummary } from "./sentiment-phrases";
import {
  generateRestaurantSummary,
  addRestaurantToVectorStore,
  queryRestaurantRAG,
} from "./rag";
import { pushAllMetrics } from "./metrics";

// International postal code validation (2-10 chars, alphanumeric with optional space/dash)
const postalCodeSchema = z.string()
  .min(2, "Postal code too short")
  .max(10, "Postal code too long")
  .regex(/^[A-Z0-9][A-Z0-9\s\-]*[A-Z0-9]$/i, "Invalid postal code format");

// Optional ISO 3166-1 alpha-2 country code
const countryCodeSchema = z.string()
  .length(2)
  .regex(/^[A-Z]{2}$/i)
  .transform(v => v.toUpperCase())
  .optional();

/** Shape of a single public note. */
interface PublicNote {
  text: string;
  name?: string;
  ts: number;
}

/** In-memory store for local dev (production uses KV). */
const localPublicNotes = new Map<string, PublicNote[]>();

/**
 * Server-side content guard — mirrors worker/content-guard.ts so local dev
 * behaves identically to production. Profanity/slurs/threats block; PII
 * gets scrubbed before persistence.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  /\bf+[u\*@]+c+k/i,
  /\bs+h+[i1!]+t/i,
  /\ba+s+s+h+o+l+e/i,
  /\bb+[i1!]+t+c+h/i,
  /\bd+[i1!]+c+k/i,
  /\bc+u+n+t/i,
  /\bw+h+o+r+e/i,
  /\bn+[i1!]+g+g/i,
  /\bsp+[i1!]+c+k?\b/i,
  /\bch+[i1!]+n+k/i,
  /\bk+[i1!]+k+e/i,
  /\bw+e+t+b+a+c+k/i,
  /\bg+o+o+k\b/i,
  /\br+e+t+a+r+d/i,
  /\bf+a+g+(?:g+o+t+)?/i,
  /\bt+r+a+n+n+y/i,
  /\b(?:kill|shoot|stab|murder|bomb)\s+(?:them|him|her|you|the)/i,
  /\b(?:i'?ll|gonna|going\s+to)\s+(?:kill|shoot|stab|hurt|beat)/i,
  /\bbring\s+(?:a\s+)?gun/i,
  /\bshoot\s*(?:up|this|the)/i,
  /\b(?:sell(?:ing)?|buy(?:ing)?|smok(?:e|ing))\s+(?:meth|crack|heroin|coke|cocaine|fentanyl|pills)\b/i,
  // Narrowly-scoped staff harassment (don't catch "fire sauce", "food sucks")
  /\bfire\s+(?:the\s+|that\s+)?(?:staff|manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender|employee)\b/i,
  /\b(?:the\s+)?(?:manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender)\s+(?:is\s+)?(?:an?\s+)?(?:idiot|moron|stupid|worthless|trash|garbage)\b/i,
];

const PII_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "phone", regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { label: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { label: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: "credit_card", regex: /\b(?:\d[-\s]?){13,19}\b/g },
];

function guardPublicNoteLocal(raw: string): {
  blocked: boolean;
  reason: string;
  cleaned: string;
  scrubbed: string[];
} {
  const text = (raw || "").trim();
  if (!text || text.length < 2) {
    return { blocked: true, reason: "Note is too short.", cleaned: "", scrubbed: [] };
  }
  if (text.length > 500) {
    return { blocked: true, reason: "Note is too long (max 500 characters).", cleaned: "", scrubbed: [] };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        blocked: true,
        reason: "This note contains language that isn't allowed in public comments. Please keep it respectful.",
        cleaned: "",
        scrubbed: [],
      };
    }
  }
  let cleaned = text;
  const scrubbed: string[] = [];
  for (const { label, regex } of PII_PATTERNS) {
    if (regex.test(cleaned)) {
      scrubbed.push(label);
      cleaned = cleaned.replace(regex, `[${label} removed]`);
    }
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return { blocked: false, reason: "", cleaned, scrubbed };
}

export const restaurantRouter = router({
  /**
   * Search for restaurants by location - INTERNATIONAL
   * Uses cache-first strategy to minimize API costs
   */
  search: publicProcedure
    .input(
      z.object({
        postalCode: postalCodeSchema,
        countryCode: countryCodeSchema,
        radius: z.number().min(1).max(100).default(5),
        radiusUnit: z.enum(['miles', 'km']).default('miles'),
        cuisineType: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      const { postalCode, countryCode, radius, radiusUnit, cuisineType, limit, forceRefresh } = input;
      
      // For local dev, treat as US if no country code and looks like ZIP
      const effectiveCountry = countryCode || (postalCode.match(/^\d{5}$/) ? 'US' : undefined);
      const cacheKey = effectiveCountry ? `${postalCode}:${effectiveCountry}` : postalCode;
      
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        // For US ZIP codes, use existing cache
        if (postalCode.match(/^\d{5}$/)) {
          const isCached = await isZipCodeCached(postalCode);
          if (isCached) {
            console.log(`[Router] Serving ${cacheKey} from cache`);
            let cached = await getCachedRestaurants(postalCode, radius);
            
            if (cuisineType) {
              cached = cached.filter(r => 
                r.cuisineType.toLowerCase().includes(cuisineType.toLowerCase()) ||
                r.categories?.some(c => c.toLowerCase().includes(cuisineType.toLowerCase()))
              );
            }
            
            return cached.slice(0, limit);
          }
        }
      }
      
      // Cache miss or force refresh - hit the APIs
      console.log(`[Router] Cache miss for ${cacheKey}, fetching from APIs`);
      
      // Local dev only supports US ZIP codes for now
      if (!postalCode.match(/^\d{5}$/)) {
        console.warn(`[Router] International postal codes require production Worker. Got: ${postalCode}`);
        return [];
      }
      
      const restaurants = await scrapeRestaurantsByLocation({
        zipCode: postalCode,
        radius,
        cuisineType,
        limit: Math.max(limit, 50),
      });
      
      if (restaurants.length > 0) {
        const sourcesUsed = [...new Set(restaurants.flatMap(r => r.sources))];
        await cacheRestaurants(postalCode, restaurants, sourcesUsed);
      }
      
      return restaurants.slice(0, limit);
    }),

  // =========================================================================
  // 🧠 AI-POWERED SEMANTIC SEARCH (Stubs for local dev - use Worker in prod)
  // =========================================================================

  /**
   * Semantic search using natural language
   * NOTE: Full AI features require production Worker with Vectorize
   */
  semanticSearch: publicProcedure
    .input(z.object({
      query: z.string().min(3).max(500),
      topK: z.number().min(1).max(50).default(10),
      filter: z.object({
        cuisineType: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        priceRange: z.string().optional(),
      }).optional(),
    }))
    .query(async ({ input }) => {
      // Local dev stub - semantic search requires Vectorize (production only)
      console.log(`[Router] Semantic search: "${input.query}" (requires production Worker)`);
      return { 
        results: [], 
        error: "Semantic search requires production deployment with Cloudflare Vectorize" 
      };
    }),

  /**
   * Find restaurants similar to a given one
   */
  similar: publicProcedure
    .input(z.object({
      restaurantId: z.string(),
      topK: z.number().min(1).max(20).default(5),
      excludeIds: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      console.log(`[Router] Similar search for ${input.restaurantId} (requires production Worker)`);
      return { 
        results: [], 
        error: "Similar search requires production deployment with Cloudflare Vectorize" 
      };
    }),

  /**
   * Get personalized recommendations based on user's favorites
   */
  recommendations: publicProcedure
    .input(z.object({
      favoriteIds: z.array(z.string()).min(1),
      topK: z.number().min(1).max(20).default(10),
      excludeIds: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      console.log(`[Router] Recommendations for ${input.favoriteIds.length} favorites (requires production Worker)`);
      return { 
        results: [], 
        error: "Recommendations require production deployment with Cloudflare Vectorize" 
      };
    }),

  /**
   * Get vector index statistics
   */
  vectorStats: publicProcedure
    .query(async () => {
      return { available: false, vectorCount: 0, dimensions: 0 };
    }),

  /**
   * Manually trigger vector indexing
   */
  reindexVectors: publicProcedure
    .input(z.object({
      cacheKey: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .mutation(async ({ input }) => {
      return { success: false, error: "Vector indexing requires production deployment" };
    }),

  // =========================================================================
  // EXISTING ENDPOINTS
  // =========================================================================

  /**
   * Get Culver's Flavor of the Day
   */
  culversFlavorOfDay: publicProcedure
    .input(
      z.object({
        zipCode: z.string().regex(/^\d{5}$/, "US ZIP code required for Culver's"),
      })
    )
    .query(async ({ input }) => {
      return fetchCulversFlavorOfTheDay(input.zipCode);
    }),

  /**
   * Get cache statistics
   */
  cacheStats: publicProcedure
    .query(async () => {
      return getCacheStats();
    }),

  /**
   * Get system status including database availability
   */
  systemStatus: publicProcedure
    .query(async () => {
      const dbStatus = getDatabaseStatus();
      const cacheStats = await getCacheStats();
      return {
        database: dbStatus,
        cache: cacheStats,
        aiFeatures: { available: false, reason: "Requires production Worker with Vectorize" },
      };
    }),

  /**
   * Force refresh cache for a postal code
   */
  refreshCache: publicProcedure
    .input(z.object({
      postalCode: postalCodeSchema,
      countryCode: countryCodeSchema,
      radius: z.number().min(1).max(100).default(10),
      radiusUnit: z.enum(['miles', 'km']).default('miles'),
    }))
    .mutation(async ({ input }) => {
      if (!input.postalCode.match(/^\d{5}$/)) {
        return { success: false, count: 0, error: "Local dev only supports US ZIP codes" };
      }
      
      const restaurants = await scrapeRestaurantsByLocation({
        zipCode: input.postalCode,
        radius: input.radius,
        limit: 50,
      });
      
      if (restaurants.length > 0) {
        const sourcesUsed = [...new Set(restaurants.flatMap(r => r.sources))];
        await cacheRestaurants(input.postalCode, restaurants, sourcesUsed);
      }
      
      return { success: true, count: restaurants.length };
    }),

  // ===========================================================================
  // Public Notes ("Tell Others")
  // ===========================================================================

  getPublicNotes: publicProcedure
    .input(z.object({ restaurantId: z.string() }))
    .query(async ({ input }) => {
      const notes = localPublicNotes.get(input.restaurantId) || [];
      return { notes: notes.slice(-50).reverse() };
    }),

  addPublicNote: publicProcedure
    .input(z.object({
      restaurantId: z.string().min(1).max(128),
      text: z.string().min(2).max(500),
      displayName: z.string().max(30).optional(),
    }))
    .mutation(async ({ input }) => {
      const guard = guardPublicNoteLocal(input.text);
      if (guard.blocked) {
        throw new Error(guard.reason);
      }
      if (guard.scrubbed.length > 0) {
        console.log(
          `[addPublicNote] scrubbed ${guard.scrubbed.join(",")} from note on ${input.restaurantId}`
        );
      }

      const safeName = (input.displayName || "")
        .replace(/[\x00-\x1F\x7F]/g, "")
        .trim()
        .slice(0, 30);

      const note: PublicNote = {
        text: guard.cleaned,
        name: safeName || undefined,
        ts: Date.now(),
      };

      const existing = localPublicNotes.get(input.restaurantId) || [];

      // Dedupe accidental double-posts within 60s
      const mostRecent = existing[existing.length - 1];
      if (
        mostRecent &&
        mostRecent.text === note.text &&
        mostRecent.name === note.name &&
        note.ts - mostRecent.ts < 60_000
      ) {
        return { success: true, note: mostRecent, deduped: true };
      }

      if (existing.length >= 200) existing.shift();
      existing.push(note);
      localPublicNotes.set(input.restaurantId, existing);

      return { success: true, note, deduped: false };
    }),

  // ===========================================================================
  // Share Import & Favorites
  // ===========================================================================

  importFromShare: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await processSharedUrl(input.url, input.userId);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }
      
      return {
        success: true,
        restaurant: result.restaurant,
        restaurantId: result.restaurantId,
      };
    }),

  getFavorites: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      return getUserFavorites(input.userId);
    }),

  removeFavorite: publicProcedure
    .input(z.object({ userId: z.string(), restaurantId: z.number() }))
    .mutation(async ({ input }) => {
      await removeFromFavorites(input.userId, input.restaurantId);
      return { success: true };
    }),

  randomFromFavorites: publicProcedure
    .input(z.object({ userId: z.string(), cuisineType: z.string().optional() }))
    .query(async ({ input }) => {
      let favorites = await getUserFavorites(input.userId);
      
      if (favorites.length === 0) return null;
      
      if (input.cuisineType) {
        favorites = favorites.filter(r =>
          r.cuisineType.toLowerCase().includes(input.cuisineType!.toLowerCase())
        );
      }
      
      if (favorites.length === 0) return null;
      
      const randomIndex = Math.floor(Math.random() * favorites.length);
      return favorites[randomIndex];
    }),

  // ===========================================================================
  // RAG & Sentiment (Local)
  // ===========================================================================

  ragSummary: publicProcedure
    .input(z.object({ restaurantId: z.string(), query: z.string() }))
    .query(async ({ input }) => {
      const summary = await generateRestaurantSummary(input.query, input.restaurantId);
      return { summary };
    }),

  ragQuery: publicProcedure
    .input(z.object({ query: z.string(), limit: z.number().min(1).max(50).optional() }))
    .query(async ({ input }) => {
      return queryRestaurantRAG(input.query, undefined, input.limit || 5);
    }),

  analyzeSentiment: publicProcedure
    .input(z.object({ restaurantName: z.string(), reviews: z.array(z.string()) }))
    .query(({ input }) => {
      const combinedText = input.reviews.join(" ");
      const sentiment = analyzeRestaurantSentiment(combinedText);
      const summary = generateReviewSummary(input.reviews, input.restaurantName);
      return { sentiment, summary };
    }),

  // ===========================================================================
  // Admin
  // ===========================================================================

  addToIndex: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string(),
      reviews: z.array(z.string()).optional().default([]),
      description: z.string().optional(),
      cuisineType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await addRestaurantToVectorStore({
        id: input.id,
        name: input.name,
        reviews: input.reviews || [],
        description: input.description,
        cuisineType: input.cuisineType,
      });
      return { ok: true };
    }),

  reindexArea: adminProcedure
    .input(z.object({
      zipCode: z.string().length(5),
      radius: z.number().min(1).max(25).default(5),
      limit: z.number().min(1).max(50).default(20),
    }))
    .mutation(async ({ input }) => {
      const { enqueueReindex } = await import('./rag-bull');
      const jobId = await enqueueReindex(input.zipCode, input.radius, input.limit);
      return { enqueued: true, jobId };
    }),

  pushMetrics: adminProcedure
    .input(z.object({ jobName: z.string().optional() }))
    .mutation(async ({ input }) => {
      await pushAllMetrics(input.jobName || 'manual');
      return { ok: true };
    }),

  queueStatus: adminProcedure
    .query(async () => {
      const { getQueueStatus } = await import('./rag-bull');
      return getQueueStatus();
    }),
});

export type RestaurantRouter = typeof restaurantRouter;
