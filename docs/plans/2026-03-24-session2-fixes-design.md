# Session 2 Fixes — Design Document

**Date:** 2026-03-24
**Branch:** `__/vibrant-goodall`

## Changes

### H2 — tRPC Procedure Stubs (worker/trpc-router.ts)
Add `systemStatus` (query — returns health/uptime) and `importFromShare` (mutation — accepts shared restaurant data, stores locally). No favorites procedures — favorites are purely local AsyncStorage.

### H3 — Rate Limiting (worker/index.ts, context.ts, wrangler.toml)
- Add `RATE_LIMIT` KV namespace binding to wrangler.toml
- Add `RATE_LIMIT` to Env type in context.ts
- Sliding-window rate limiter middleware keyed on `cf-connecting-ip`:
  - 60 req/min for tRPC endpoints
  - 10 req/min for upload endpoints
  - Returns 429 with `Retry-After` header when exceeded

### H5 — Dietary Disclaimer (app/(tabs)/browse.tsx)
Small disclaimer text below dietary filter chips: "Dietary info is inferred and may not be accurate. Always confirm with the restaurant."

### M1 — getRestaurantsWithDistance Signature (hooks/use-restaurant-storage.ts)
Change from `(zipCode: string)` to `({lat, lon}: {lat: number; lon: number})`. Remove dependency on hardcoded `ZIP_CODE_COORDS` lookup. Direct Haversine calculation from provided coords.

### M2 — Postal Input Improvements (app/(tabs)/index.tsx)
- `maxLength={10}` on TextInput
- `keyboardType="default"` (supports international postal codes with letters)
- Search triggers on `isValidPostalCode()` validation

### M3 — Distance-Based Filtering (app/(tabs)/index.tsx)
Replace ZIP-prefix string filter with `calculateDistance()` radius filtering using GPS coords from the location hook.

### FAV — Favorites Icon Swap
Replace `heart.fill` with `fork.knife` (crossed utensils) for:
- Favorites tab icon in `_layout.tsx`
- Favorite toggle button in `restaurant/[id].tsx`
- Restaurant card favorite button
- Empty state icon in `favorites.tsx`

### FAV-UI — Favorites as Structured Notepad (app/(tabs)/favorites.tsx)
Redesign favorites screen as expandable notepad:
- **Collapsed row:** restaurant name, cuisine type, distance, crossed-utensils icon
- **Expanded row:** full details (address, phone, rating, hours) + editable notes TextInput
- Retain existing "Pick from Favorites" shuffle button and AI recommendations section at top

### MERGE — Combine About + What People Say (app/restaurant/[id].tsx)
Merge the separate "About" (description) and "What People Say" (sentiment) sections into a single "About" card:
1. `restaurant.description` text
2. Sentiment badge (Highly Recommended / Mixed / etc.)
3. `reviewSummary` text
4. Highlight tags ("Praised for:")
5. Warning tags ("Watch out for:")

If no description exists, section shows just sentiment. If no sentiment, just description.

## Design Decisions
- **No auth, ever.** Favorites and notes are local AsyncStorage. No server-side user accounts.
- **No mock data.** Stubs that aren't implemented throw "not implemented" errors.
- **fork.knife icon** replaces heart as the universal "save/favorite" indicator.
