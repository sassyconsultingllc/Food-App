# Audit Remaining Fixes Design

Date: 2026-03-24
Status: Approved

## H2: AppRouter Type Sync

Add missing procedure stubs to worker/trpc-router.ts so its type is a superset of the server router. Procedures to add: importFromShare, getFavorites, removeFavorite, randomFromFavorites, ragSummary, ragQuery, analyzeSentiment, systemStatus (all returning stubs indicating "requires local dev server" or similar). Admin-only procedures (addToIndex, reindexArea, pushMetrics, queueStatus) also get stubs.

## H3: Rate Limiting

Add KV namespace (RATE_LIMIT) to wrangler.toml and worker/context.ts Env type. Implement Hono middleware using sliding-window counters in KV:
- /api/trpc/* — 60 req/min per IP
- /api/menu/*/upload — 10 req/min per IP
- /api/health — exempt

## H5: Dietary Disclaimer

Add disclaimer text below dietary filter chips in app/(tabs)/browse.tsx: "Dietary options are estimated from cuisine type and should be confirmed with the restaurant."

## M1: Distance from GPS

Modify getRestaurantsWithDistance in hooks/use-restaurant-storage.ts to accept {lat, lon} coordinates instead of ZIP string. Callers pass GPS coords from useLocation hook, falling back to geocoded ZIP.

## M2: International Postal Codes on Home

In app/(tabs)/index.tsx: change ZIP input to maxLength={10}, keyboardType="default". Replace the `text.length === 5` auto-search trigger with isValidPostalCode() from geo-service.

## M3: Distance-Based Filter

Replace ZIP prefix filter in app/(tabs)/index.tsx filteredRestaurants memo with calculateDistance-based filtering using user's GPS/geocoded coords and selected radius.
