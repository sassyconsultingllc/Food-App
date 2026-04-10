/**
 * tRPC Router for Cloudflare Workers - INTERNATIONAL + AI-POWERED
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Features:
 * - Cache-first strategy for structured queries
 * - Semantic search for natural language discovery
 * - "More Like This" recommendations
 * - AI-powered restaurant matching
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import superjson from "superjson";
import type { Env } from "./context";
import { scrapeRestaurants, fetchCulversFlavor } from "./scraper";
import { initCacheTables, isPostalCodeCached, getCachedRestaurants, cacheRestaurants, getCacheStats } from "./cache";
import { semanticSearch, findSimilar, indexRestaurants, getIndexStats, recommendFromFavorites } from "./vector-search";
import { RestaurantEmbeddingInput } from "./embeddings";
import { guardPublicNote, checkNoteRateLimit } from "./content-guard";

interface Context {
  env: Env;
  req?: Request;
}

/** Shape of a single public note stored in KV. */
interface PublicNote {
  text: string;
  name?: string;
  ts: number;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const publicProcedure = t.procedure;
export const router = t.router;

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

export const appRouter = router({
  restaurant: router({
    /**
     * Search for restaurants by location - INTERNATIONAL
     * Uses cache-first strategy to minimize API costs
     */
    search: publicProcedure
      .input(z.object({
        postalCode: postalCodeSchema,
        countryCode: countryCodeSchema,
        radius: z.number().min(1).max(100).default(5),
        radiusUnit: z.enum(['miles', 'km']).default('miles'),
        cuisineType: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        forceRefresh: z.boolean().optional().default(false),
      }))
      .query(async ({ input, ctx }) => {
        const { postalCode, countryCode, radius, radiusUnit, cuisineType, limit, forceRefresh } = input;
        const env = ctx.env;
        const db = env.DB;
        
        const cacheKey = countryCode ? `${postalCode}:${countryCode}` : postalCode;
        
        if (db) {
          try {
            await initCacheTables(db);
          } catch (e) {
            console.warn("[Router] Cache init failed:", e);
          }
        }
        
        if (db && !forceRefresh) {
          const isCached = await isPostalCodeCached(db, cacheKey);
          
          if (isCached) {
            console.log(`[Router] Serving ${cacheKey} from cache`);
            let cached = await getCachedRestaurants(db, cacheKey);
            
            if (cuisineType) {
              cached = cached.filter((r: any) =>
                r.cuisineType?.toLowerCase().includes(cuisineType.toLowerCase()) ||
                r.categories?.some((c: string) => c.toLowerCase().includes(cuisineType.toLowerCase()))
              );
            }
            
            return cached.slice(0, limit);
          }
        }
        
        console.log(`[Router] Cache miss for ${cacheKey}, fetching from APIs`);
        
        // If no countryCode provided and postal code looks like a US 5-digit ZIP,
        // prefer US geocoding to avoid ambiguous international postal codes
        let effectiveCountryCode = countryCode;
        const looksLikeUSZip = /^[0-9]{5}$/.test(postalCode);
        if (!effectiveCountryCode && looksLikeUSZip) {
          effectiveCountryCode = 'US';
        }
        
        let restaurants = await scrapeRestaurants({
          postalCode,
          countryCode: effectiveCountryCode,
          radius,
          radiusUnit,
          limit: Math.max(limit, 50),
          foursquareKey: env.FOURSQUARE_API_KEY || "",
          hereKey: env.HERE_API_KEY || "",
          googleKey: env.GOOGLE_PLACES_API_KEY || "",
        });
        
        // If we guessed US but results appear entirely from another country,
        // retry explicitly forcing US geocoding to prefer local matches.
        if (looksLikeUSZip && !countryCode) {
          const nonUS = restaurants.filter(r => r.countryCode && r.countryCode !== 'US');
          const anyUS = restaurants.some(r => r.countryCode === 'US');
          if (restaurants.length > 0 && !anyUS && nonUS.length === restaurants.length) {
            console.log('[Router] Results appear non-US; retrying scrape with explicit US country code');
            restaurants = await scrapeRestaurants({
              postalCode,
              countryCode: 'US',
              radius,
              radiusUnit,
              limit: Math.max(limit, 50),
              foursquareKey: env.FOURSQUARE_API_KEY || "",
              hereKey: env.HERE_API_KEY || "",
              googleKey: env.GOOGLE_PLACES_API_KEY || "",
            });
          }
        }

        // If we have an effective country code, prefer restaurants from that country
        if (effectiveCountryCode) {
          const countryUpper = effectiveCountryCode.toUpperCase();
          const filtered = restaurants.filter(r => (r.countryCode || '').toUpperCase() === countryUpper);
          if (filtered.length > 0) {
            console.log(`[Router] Filtering results to country ${countryUpper}: ${filtered.length}/${restaurants.length}`);
            restaurants = filtered;
          } else {
            console.log(`[Router] No provider results matched country ${countryUpper}; keeping original ${restaurants.length} results`);
          }
        }
        
        if (db && restaurants.length > 0) {
          const sourcesUsed = [...new Set(restaurants.flatMap((r: any) => r.sources || []))];
          await cacheRestaurants(db, cacheKey, restaurants, sourcesUsed);
          
          // Also index to vector store for semantic search
          if (env.VECTORIZE && env.AI) {
            try {
              const toIndex: RestaurantEmbeddingInput[] = restaurants.map((r: any) => ({
                id: r.id,
                name: r.name,
                cuisineType: r.cuisineType,
                categories: r.categories,
                priceRange: r.priceRange,
                city: r.city,
                country: r.country,
                reviewSummary: r.reviewSummary,
                sentiment: r.sentiment,
              }));
              await indexRestaurants(env.VECTORIZE, env.AI, toIndex);
            } catch (e) {
              console.warn("[Router] Vector indexing failed:", e);
            }
          }
        }
        
        let filtered = restaurants;
        if (cuisineType) {
          filtered = restaurants.filter((r: any) =>
            r.cuisineType?.toLowerCase().includes(cuisineType.toLowerCase()) ||
            r.categories?.some((c: string) => c.toLowerCase().includes(cuisineType.toLowerCase()))
          );
        }
        
        return filtered.slice(0, limit);
      }),

    // =========================================================================
    // 🧠 AI-POWERED SEMANTIC SEARCH
    // =========================================================================

    /**
     * Semantic search using natural language
     * 
     * Examples:
     * - "Cozy Italian with romantic atmosphere"
     * - "Kid-friendly with outdoor seating"
     * - "Late night food that's not fast food"
     * - "Hidden gem with amazing brunch"
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
      .query(async ({ input, ctx }) => {
        const { VECTORIZE, AI, DB } = ctx.env;
        
        if (!VECTORIZE || !AI) {
          return { 
            results: [], 
            error: "Semantic search not available - vector index not configured" 
          };
        }
        
        try {
          const vectorResults = await semanticSearch(VECTORIZE, AI, {
            query: input.query,
            topK: input.topK,
            filter: input.filter,
          });
          
          // If we have D1, enrich with full restaurant data
          if (DB && vectorResults.length > 0) {
            const ids = vectorResults.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            
            const fullData = await DB.prepare(
              `SELECT data FROM restaurant_cache WHERE id IN (${placeholders})`
            ).bind(...ids).all<{ data: string }>();
            
            const dataMap = new Map<string, any>();
            for (const row of fullData.results || []) {
              try {
                const parsed = JSON.parse(row.data);
                dataMap.set(parsed.id, parsed);
              } catch {}
            }
            
            return {
              results: vectorResults.map(vr => ({
                ...vr,
                restaurant: dataMap.get(vr.id) || null,
              })),
            };
          }
          
          return { results: vectorResults };
        } catch (error) {
          console.error("[Router] Semantic search error:", error);
          return { results: [], error: "Search failed" };
        }
      }),

    /**
     * Find restaurants similar to a given one
     * "More Like This" feature
     */
    similar: publicProcedure
      .input(z.object({
        restaurantId: z.string(),
        topK: z.number().min(1).max(20).default(5),
        excludeIds: z.array(z.string()).optional(),
      }))
      .query(async ({ input, ctx }) => {
        const { VECTORIZE, AI, DB } = ctx.env;
        
        if (!VECTORIZE || !AI) {
          return { 
            results: [], 
            error: "Similar search not available - vector index not configured" 
          };
        }
        
        try {
          const similarResults = await findSimilar(VECTORIZE, AI, DB!, {
            restaurantId: input.restaurantId,
            topK: input.topK,
            excludeIds: input.excludeIds,
          });
          
          // Enrich with full data
          if (DB && similarResults.length > 0) {
            const ids = similarResults.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            
            const fullData = await DB.prepare(
              `SELECT data FROM restaurant_cache WHERE id IN (${placeholders})`
            ).bind(...ids).all<{ data: string }>();
            
            const dataMap = new Map<string, any>();
            for (const row of fullData.results || []) {
              try {
                const parsed = JSON.parse(row.data);
                dataMap.set(parsed.id, parsed);
              } catch {}
            }
            
            return {
              results: similarResults.map(sr => ({
                ...sr,
                restaurant: dataMap.get(sr.id) || null,
              })),
            };
          }
          
          return { results: similarResults };
        } catch (error) {
          console.error("[Router] Similar search error:", error);
          return { results: [], error: "Search failed" };
        }
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
      .query(async ({ input, ctx }) => {
        const { VECTORIZE, AI, DB } = ctx.env;
        
        if (!VECTORIZE || !AI) {
          return { 
            results: [], 
            error: "Recommendations not available - vector index not configured" 
          };
        }
        
        try {
          const recommendations = await recommendFromFavorites(VECTORIZE, AI, input.favoriteIds, {
            topK: input.topK,
            excludeIds: input.excludeIds,
          });
          
          // Enrich with full data
          if (DB && recommendations.length > 0) {
            const ids = recommendations.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            
            const fullData = await DB.prepare(
              `SELECT data FROM restaurant_cache WHERE id IN (${placeholders})`
            ).bind(...ids).all<{ data: string }>();
            
            const dataMap = new Map<string, any>();
            for (const row of fullData.results || []) {
              try {
                const parsed = JSON.parse(row.data);
                dataMap.set(parsed.id, parsed);
              } catch {}
            }
            
            return {
              results: recommendations.map(rec => ({
                ...rec,
                restaurant: dataMap.get(rec.id) || null,
              })),
            };
          }
          
          return { results: recommendations };
        } catch (error) {
          console.error("[Router] Recommendations error:", error);
          return { results: [], error: "Recommendations failed" };
        }
      }),

    /**
     * Get vector index statistics
     */
    vectorStats: publicProcedure
      .query(async ({ ctx }) => {
        const { VECTORIZE } = ctx.env;
        
        if (!VECTORIZE) {
          return { available: false, vectorCount: 0, dimensions: 0 };
        }
        
        try {
          const stats = await getIndexStats(VECTORIZE);
          return { available: true, ...stats };
        } catch (error) {
          return { available: false, vectorCount: 0, dimensions: 0 };
        }
      }),

    /**
     * Manually trigger vector indexing for cached restaurants
     */
    reindexVectors: publicProcedure
      .input(z.object({
        cacheKey: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      }))
      .mutation(async ({ input, ctx }) => {
        const { VECTORIZE, AI, DB } = ctx.env;
        
        if (!VECTORIZE || !AI || !DB) {
          return { success: false, error: "Vector indexing not available" };
        }
        
        try {
          // Get restaurants from cache
          let query = 'SELECT data FROM restaurant_cache';
          const params: string[] = [];
          
          if (input.cacheKey) {
            query += ' WHERE cache_key = ?';
            params.push(input.cacheKey);
          }
          
          query += ` LIMIT ${input.limit}`;
          
          const stmt = params.length > 0 
            ? DB.prepare(query).bind(...params)
            : DB.prepare(query);
          
          const results = await stmt.all<{ data: string }>();
          
          if (!results.results?.length) {
            return { success: true, indexed: 0, message: "No restaurants to index" };
          }
          
          const restaurants: RestaurantEmbeddingInput[] = [];
          for (const row of results.results) {
            try {
              const r = JSON.parse(row.data);
              restaurants.push({
                id: r.id,
                name: r.name,
                cuisineType: r.cuisineType,
                categories: r.categories,
                priceRange: r.priceRange,
                city: r.city,
                country: r.country,
                reviewSummary: r.reviewSummary,
                sentiment: r.sentiment,
              });
            } catch {}
          }
          
          const result = await indexRestaurants(VECTORIZE, AI, restaurants);
          
          return { 
            success: true, 
            indexed: result.indexed, 
            errors: result.errors.length > 0 ? result.errors : undefined 
          };
        } catch (error) {
          console.error("[Router] Reindex error:", error);
          return { success: false, error: "Indexing failed" };
        }
      }),

    // =========================================================================
    // EXISTING ENDPOINTS
    // =========================================================================

    /**
     * Get Culver's Flavor of the Day (US-only feature)
     */
    culversFlavorOfDay: publicProcedure
      .input(z.object({
        zipCode: z.string().regex(/^\d{5}$/, "US ZIP code required for Culver's"),
      }))
      .query(async ({ input }) => {
        return fetchCulversFlavor(input.zipCode);
      }),

    /**
     * Get cache statistics
     */
    cacheStats: publicProcedure
      .query(async ({ ctx }) => {
        const db = ctx.env.DB;
        if (!db) {
          return { postalCodesCount: 0, restaurantsCount: 0, oldestCache: null, newestCache: null };
        }
        return getCacheStats(db);
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
      .mutation(async ({ input, ctx }) => {
        const env = ctx.env;
        const db = env.DB;
        
        const cacheKey = input.countryCode 
          ? `${input.postalCode}:${input.countryCode}` 
          : input.postalCode;
        
        const restaurants = await scrapeRestaurants({
          postalCode: input.postalCode,
          countryCode: input.countryCode,
          radius: input.radius,
          radiusUnit: input.radiusUnit,
          limit: 50,
          foursquareKey: env.FOURSQUARE_API_KEY || "",
          hereKey: env.HERE_API_KEY || "",
          googleKey: env.GOOGLE_PLACES_API_KEY || "",
        });
        
        if (db && restaurants.length > 0) {
          const sourcesUsed = [...new Set(restaurants.flatMap((r: any) => r.sources || []))];
          await cacheRestaurants(db, cacheKey, restaurants, sourcesUsed);
        }
        
        return { success: true, count: restaurants.length };
      }),
    
    // =========================================================================
    // SERVER-COMPATIBLE STUBS (keep AppRouter in sync with local dev server)
    // =========================================================================


    /**
     * Get user favorites (server-side)
     */
    getFavorites: publicProcedure
      .input(z.object({ userId: z.string() }))
      .query(async () => {
        return [];
      }),

    /**
     * Remove a favorite (server-side)
     */
    removeFavorite: publicProcedure
      .input(z.object({ userId: z.string(), restaurantId: z.number() }))
      .mutation(async () => {
        return { success: false, error: "Server-side favorites not available in production worker" };
      }),

    /**
     * Random pick from favorites (server-side)
     */
    randomFromFavorites: publicProcedure
      .input(z.object({ userId: z.string(), cuisineType: z.string().optional() }))
      .query(async () => {
        return null;
      }),

    /**
     * Legacy search endpoint accepting zipCode (deprecated)
     */
    searchByZip: publicProcedure
      .input(z.object({
        zipCode: z.string().length(5),
        radius: z.number().min(1).max(25).default(5),
        cuisineType: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        forceRefresh: z.boolean().optional().default(false),
      }))
      .query(async ({ input, ctx }) => {
        const { zipCode, ...rest } = input;
        const db = ctx.env.DB;
        
        if (db) {
          try { await initCacheTables(db); } catch (e) { /* ignore */ }
        }
        
        const cacheKey = `${zipCode}:US`;
        
        if (db && !input.forceRefresh) {
          const isCached = await isPostalCodeCached(db, cacheKey);
          if (isCached) {
            let cached = await getCachedRestaurants(db, cacheKey);
            if (input.cuisineType) {
              cached = cached.filter((r: any) =>
                r.cuisineType?.toLowerCase().includes(input.cuisineType!.toLowerCase())
              );
            }
            return cached.slice(0, input.limit);
          }
        }
        
        const restaurants = await scrapeRestaurants({
          postalCode: zipCode,
          countryCode: 'US',
          radius: input.radius,
          radiusUnit: 'miles',
          limit: Math.max(input.limit, 50),
          foursquareKey: ctx.env.FOURSQUARE_API_KEY || "",
          hereKey: ctx.env.HERE_API_KEY || "",
          googleKey: ctx.env.GOOGLE_PLACES_API_KEY || "",
        });
        
        if (db && restaurants.length > 0) {
          const sources = [...new Set(restaurants.flatMap((r: any) => r.sources || []))];
          await cacheRestaurants(db, cacheKey, restaurants, sources);
        }
        
        let filtered = restaurants;
        if (input.cuisineType) {
          filtered = restaurants.filter((r: any) =>
            r.cuisineType?.toLowerCase().includes(input.cuisineType!.toLowerCase())
          );
        }
        
        return filtered.slice(0, input.limit);
      }),

    /**
     * System status / health check
     */
    systemStatus: publicProcedure
      .query(async ({ ctx }) => {
        const { DB, VECTORIZE, AI, MENU_PHOTOS } = ctx.env;
        return {
          ok: true,
          timestamp: Date.now(),
          bindings: {
            db: !!DB,
            vectorize: !!VECTORIZE,
            ai: !!AI,
            menuPhotos: !!MENU_PHOTOS,
          },
        };
      }),

    // =========================================================================
    // PUBLIC NOTES ("Tell Others")
    // =========================================================================

    /**
     * Get public notes for a restaurant
     */
    getPublicNotes: publicProcedure
      .input(z.object({
        restaurantId: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        const kv = ctx.env.FOODIE_PUBLIC_NOTES;
        if (!kv) {
          return { notes: [] };
        }

        const raw = await kv.get(`notes:${input.restaurantId}`);
        if (!raw) {
          return { notes: [] };
        }

        try {
          const notes = JSON.parse(raw) as PublicNote[];
          // Return newest first, max 50
          return { notes: notes.slice(-50).reverse() };
        } catch {
          return { notes: [] };
        }
      }),

    /**
     * Add a public note to a restaurant (anonymous, optional display name).
     *
     * Server is the real source of truth for moderation:
     *  1. Rate-limit per IP (10 notes / hour via RATE_LIMIT KV)
     *  2. Run the full content guard (profanity / slurs / threats → hard block)
     *  3. Scrub any PII (phone / email / SSN / credit card) before persisting
     *  4. Dedupe against the last note by the same IP to stop accidental double-posts
     *  5. Append to FOODIE_PUBLIC_NOTES, capped at 200 notes per restaurant
     */
    addPublicNote: publicProcedure
      .input(z.object({
        restaurantId: z.string().min(1).max(128),
        text: z.string().min(2, "Note too short").max(500, "Note too long"),
        displayName: z.string().max(30).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const kv = ctx.env.FOODIE_PUBLIC_NOTES;
        if (!kv) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Public notes storage not configured",
          });
        }

        // 1. Rate limit per client IP (falls back to a shared bucket if we
        //    can't read the header, which is still bounded).
        const rateLimitKv = ctx.env.RATE_LIMIT;
        const ip =
          ctx.req?.headers.get("cf-connecting-ip") ||
          ctx.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "anon";
        if (rateLimitKv) {
          const rl = await checkNoteRateLimit(rateLimitKv, ip, 10);
          if (!rl.allowed) {
            const minutes = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 60000));
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `You've hit the hourly tip limit. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
            });
          }
        }

        // 2 + 3. Content moderation + PII scrubbing.
        const guard = guardPublicNote(input.text);
        if (guard.blocked) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: guard.reason,
          });
        }
        if (guard.scrubbed.length > 0) {
          console.log(
            `[addPublicNote] scrubbed ${guard.scrubbed.join(",")} from note on ${input.restaurantId}`
          );
        }

        // Clamp display name to printable characters and trim.
        const safeName = (input.displayName || "")
          .replace(/[\x00-\x1F\x7F]/g, "")
          .trim()
          .slice(0, 30);

        const note: PublicNote = {
          text: guard.cleaned,
          name: safeName || undefined,
          ts: Date.now(),
        };

        // 4 + 5. Load, dedupe, append, cap, persist.
        const key = `notes:${input.restaurantId}`;
        const raw = await kv.get(key);
        const existing: PublicNote[] = raw ? JSON.parse(raw) : [];

        const mostRecent = existing[existing.length - 1];
        if (
          mostRecent &&
          mostRecent.text === note.text &&
          mostRecent.name === note.name &&
          note.ts - mostRecent.ts < 60_000
        ) {
          // Duplicate submission within 60s — treat as success without double-writing.
          return { success: true, note: mostRecent, deduped: true };
        }

        if (existing.length >= 200) {
          existing.shift();
        }
        existing.push(note);

        await kv.put(key, JSON.stringify(existing));

        return { success: true, note, deduped: false };
      }),

    /**
     * Import a restaurant from a shared link/payload
     * Accepts shared restaurant JSON and stores it in the D1 cache
     */
    importFromShare: publicProcedure
      .input(z.object({
        restaurant: z.object({
          id: z.string(),
          name: z.string(),
          cuisineType: z.string(),
          address: z.string(),
          city: z.string().optional(),
          state: z.string().optional(),
          zipCode: z.string().optional(),
          latitude: z.number(),
          longitude: z.number(),
        }),
        cacheKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = ctx.env.DB;
        if (!db) {
          throw new Error("Database not configured");
        }

        const { restaurant, cacheKey } = input;
        const key = cacheKey || restaurant.zipCode || "shared";

        await cacheRestaurants(db, key, [restaurant], ["shared"]);

        return { success: true, id: restaurant.id };
      }),

    // =========================================================================
    // RAG & SENTIMENT (runtime parity with server/restaurant-router.ts)
    // These are implemented locally (server/) but run degraded in the worker
    // so the client type surface matches both environments.
    // =========================================================================

    ragSummary: publicProcedure
      .input(z.object({ restaurantId: z.string(), query: z.string() }))
      .query(async () => {
        // Worker has no Chroma/OpenAI RAG stack — return empty summary
        return { summary: "" };
      }),

    ragQuery: publicProcedure
      .input(z.object({
        query: z.string(),
        limit: z.number().min(1).max(50).optional(),
      }))
      .query(async () => {
        return {
          documents: [] as string[],
          metadatas: [] as any[],
          distances: [] as number[],
        };
      }),

    analyzeSentiment: publicProcedure
      .input(z.object({
        restaurantName: z.string(),
        reviews: z.array(z.string()),
      }))
      .query(async () => {
        // Neutral fallback matching SentimentResult shape in server/types
        return {
          sentiment: {
            score: 0,
            sentiment: "neutral" as const,
            positiveCount: 0,
            negativeCount: 0,
            summary: "",
            highlights: [] as string[],
            warnings: [] as string[],
          },
          summary: "",
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
