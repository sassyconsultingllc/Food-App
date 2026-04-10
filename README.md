# Foodie Finder

> Where to eat, without the endless scrolling.

Foodie Finder is a cross-platform mobile app that helps you decide where to eat. Spin a wheel of nearby restaurants, favorite the places you love, read community tips from other diners, and get personalized recommendations — including matches in other cities for when you travel.

**Veteran-owned** · Built by [Sassy Consulting LLC](https://sassyconsultingllc.com)

---

## What it does

- **🎰 Spin the wheel.** Random-pick from real restaurants near any postal code. Filter by price, cuisine, open now, and how recently you've been there.
- **⭐ Favorites are yours.** Heart-mark restaurants you like. Favorites and notes live on your device only — no account, no login, no cloud sync.
- **📝 Two kinds of notes.**
  - **Personal notes** — private, on-device, for remembering "get the fish tacos"
  - **Community tips** — optional public notes visible to other diners, rate-limited and content-moderated
- **🗺️ Real data from real sources.** Google Places, Foursquare, HERE Maps, OpenStreetMap, and Culver's public API all merged into one result set with aggregated ratings.
- **📸 Menu photos, correctly classified.** Google Vision OCR identifies which restaurant photos are actual menu pages (not food shots) and surfaces them in a dedicated menu section. You can also upload your own menu photos.
- **✨ Taste-based recommendations.** Favorite a few restaurants in your home area, and the app builds a local-only taste profile. It then surfaces:
  - **In Your Area** — similar spots you haven't tried yet
  - **When You Travel** — matches in cities far from home (cross-locale matching via a favorites centroid + geographic radius filter)
- **🍦 Culver's Flavor of the Day** — because Midwest.
- **🔗 Share from Google Maps.** Tap "Share" on any Google Maps restaurant and Foodie Finder will import it directly.
- **🔍 Natural-language search.** "Cozy Italian with outdoor seating" or "late-night food that's not fast food" — semantic search via Cloudflare Vectorize + Workers AI (production only).

## Architecture

```
┌──────────────────────────┐
│  Expo / React Native     │  SDK 54, new arch, Hermes
│  app/                    │  iOS + Android + (partial) web
│  - (tabs)/               │  Home, Browse, Favorites, Settings
│  - restaurant/[id].tsx   │  Detail page
│  components/             │  PhotoCarousel, MenuSection, PublicNotes,
│  hooks/                  │  TasteMatches, SpinnerWheel, etc.
│  utils/                  │
└──────────┬───────────────┘
           │ tRPC over HTTPS (superjson)
           ▼
┌──────────────────────────┐
│  Cloudflare Worker       │  Hono + tRPC
│  worker/                 │  - Google Places / Foursquare / HERE / OSM scraper
│  - trpc-router.ts        │  - D1 restaurant cache
│  - scraper.ts            │  - KV for community tips + rate limit
│  - content-guard.ts      │  - R2 for menu photo uploads
│  - vector-search.ts      │  - Vectorize + Workers AI for semantic search
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Cloudflare edge         │
│  - D1 database           │
│  - KV (RATE_LIMIT +      │
│    FOODIE_PUBLIC_NOTES)  │
│  - R2 (MENU_PHOTOS)      │
│  - Vectorize index       │
│  - Workers AI            │
└──────────────────────────┘
```

Local development runs a parallel `server/` tRPC on Node that mirrors the worker's routes, so you can iterate without Cloudflare.

## Project structure

```
.
├── app/                  # Expo Router screens
├── components/           # React Native components
├── hooks/                # React hooks (local state, tRPC clients, taste profile)
├── utils/                # Pure helpers (geo, hours, PII guard, photo classifier)
├── server/               # Local-dev tRPC server (mirrors worker API)
├── worker/               # Cloudflare Worker production backend
├── types/                # Shared TypeScript types
├── constants/            # Theme, OAuth constants
├── context/, contexts/   # React context providers
├── lib/                  # Runtime bits (tRPC client, env validator)
├── scripts/              # Ad-hoc scripts (integration tests, content guard tests)
├── assets/               # Icons, fonts, splash images
├── android/              # Native Android project (committed, not managed)
├── wrangler.toml         # Cloudflare Worker config
├── app.config.ts         # Expo config
└── eas.json              # EAS Build profiles
```

## Setup

### Prerequisites

- Node 20+ (Node 24 works)
- pnpm (or npm/yarn — project is pnpm-native)
- EAS CLI: `npm install -g eas-cli`
- Wrangler CLI (installed via project deps)
- Android Studio + JDK 17 (for local Android builds)
- Xcode (for local iOS builds, macOS only)

### Install

```bash
pnpm install
```

### Environment variables

Copy `.env.example` → `.env` and fill in the required keys:

```bash
# Required — server-side, never committed
GOOGLE_PLACES_API_KEY=         # https://console.cloud.google.com — enable Places API
FOURSQUARE_API_KEY=            # https://foursquare.com/developers
HERE_API_KEY=                  # https://developer.here.com
JWT_SECRET=                    # any long random string

# Required — client-side (EXPO_PUBLIC_ prefix = bundled into app)
EXPO_PUBLIC_API_BASE_URL=      # dev: http://localhost:3000, prod: https://foodie-finder.sassyconsultingllc.com
EXPO_PUBLIC_GOOGLE_VISION_API_KEY=  # https://console.cloud.google.com — enable Vision API

# Optional — if you want to populate the Vectorize semantic index locally
DATABASE_URL=
CLOUDFLARE_ACCOUNT_ID=
```

`.env` is `.gitignore`d. Never commit API keys — the project has a linter check for that.

### Run locally

```bash
# Start the Metro bundler + the local tRPC server together
pnpm dev

# Or run them separately:
pnpm dev:metro       # Expo Metro bundler
pnpm dev:server      # tsx watch server/_core/index.ts

# Worker (Cloudflare local dev)
pnpm worker:dev
```

Scan the QR code with Expo Go or your dev client, or press `a` / `i` to open the Android / iOS simulator.

## Testing

```bash
# Unit + integration tests (vitest)
pnpm test

# Typecheck the whole project
npx tsc --noEmit

# Lint + fix
pnpm lint

# Expo health check
npx expo-doctor

# Integration test: real Google Places data + cross-locale taste matching
pnpm tsx scripts/test-cross-locale-matching.ts

# Content guard unit test
pnpm tsx scripts/test-content-guard.ts
```

## Deployment

### Mobile (Expo + EAS Build)

```bash
# Preview APK for internal testing
npx eas-cli build --platform android --profile preview

# Production AAB for Play Store
npx eas-cli build --platform android --profile production

# iOS builds (requires Apple Developer account)
npx eas-cli build --platform ios --profile preview
```

Build profiles live in `eas.json`. The project uses the committed `android/` native folder (not managed prebuild), so app.config.ts fields like `plugins`, `ios`, `android` are informational — the native files are the source of truth.

### Backend (Cloudflare Worker)

```bash
# Deploy to preview environment
npx wrangler deploy --env preview

# Deploy to production
npx wrangler deploy --env production
```

The worker is configured in `wrangler.toml`. It binds:

- `DB` → D1 (`foodie-finder`)
- `FOODIE_PUBLIC_NOTES` → KV (community tips)
- `RATE_LIMIT` → KV (per-IP rate limiter)
- `MENU_PHOTOS` → R2 (user menu photo uploads)
- `VECTORIZE` → Vectorize index (semantic search)
- `AI` → Workers AI (embeddings)

API keys (`GOOGLE_PLACES_API_KEY`, `FOURSQUARE_API_KEY`, `HERE_API_KEY`, `JWT_SECRET`) are set via `wrangler secret put`, NOT in `wrangler.toml`.

## Feature deep-dives

### Menu photo classification
`hooks/use-classified-photos.ts` → `utils/photo-classifier.ts` runs Google Cloud Vision `TEXT_DETECTION` on Google Places photos, treats photos with dense text (≥250 chars, ≥40 words, ≥8 lines) as menu pages, and routes them to the `MenuSection` component. Results are cached per-URL in AsyncStorage so re-opening a restaurant is free. Food photos go to the `PhotoCarousel`; menu photos go to the `MenuSection` (capped at 5).

### Taste profile + cross-locale matching
`hooks/use-taste-profile.ts` builds a profile from the user's favorites:

- **Cuisine weights** — normalized counts, excluding generic tokens like "Restaurant" / "Food" / "establishment"
- **Price weights** — `$`/`$$`/`$$$`/`$$$$` distribution
- **Rating centroid** — mean aggregated rating
- **Cuisine coverage** — fraction of favorites with a specific (non-generic) cuisine tag
- **Favorites centroid** — geographic center (lat/lng) of all favorites

Scoring is **adaptive**: if cuisine coverage is high, cuisine dominates. If coverage is low (user favorited mostly "Restaurant" genericos), the scorer falls back to price + rating proximity. Cross-locale filtering uses haversine distance from the favorites centroid, NOT city-name string matching, so adjacent small towns are correctly treated as "local" rather than "travel."

### Community tips + content guard
`components/public-notes-section.tsx` posts tips via the `addPublicNote` tRPC procedure. Moderation happens on BOTH the client (`utils/pii-guard.ts`, advisory) and the worker (`worker/content-guard.ts`, enforcing). The worker:

1. Rate-limits per `cf-connecting-ip` via the `RATE_LIMIT` KV namespace (10 posts/hour)
2. Runs `guardPublicNote()` — hard-blocks profanity, slurs, threats, drug promotion, and narrowly-scoped staff harassment ("fire the manager")
3. Scrubs PII (phone, email, SSN, credit card) and replaces with `[type removed]` placeholders
4. Dedupes identical tips from the same IP within 60s
5. Caps per-restaurant notes at 200 (rotating oldest out)

The patterns are intentionally narrow so legitimate complaints like "food sucks" or mentions of "fire sauce" are NOT blocked. 13/13 test cases pass in `scripts/test-content-guard.ts`.

## Security posture

- No user accounts — no password storage, no JWT refresh tokens, no OAuth
- Favorites / notes / preferences are device-local only
- API keys loaded exclusively from environment variables (`server/_core/env.ts::ENV`)
- Community tip moderation enforced server-side with narrowly-scoped regex rules
- PII auto-scrubbed from user-generated content
- Per-IP rate limiting on write endpoints
- HTTPS/TLS everywhere
- `.env`, `keys/`, `*.pem`, `*.p12`, `*.jks` all excluded from both `.gitignore` and `.easignore`

See `COMPLIANT_PRIVACY_POLICY.md` for the full privacy policy and `TERMS_OF_SERVICE.md` for terms.

## Contributing

This is a private repository. If you've been given access and want to contribute:

1. Branch from `master`
2. Run `npx tsc --noEmit && pnpm test` before pushing
3. Keep commits atomic and descriptive
4. No secrets in source — use `.env`
5. New features that add data flows require a privacy policy update

## License

Proprietary. © 2025 Sassy Consulting LLC. All rights reserved.

## Contact

**Email:** info@sassyconsultingllc.com
**Website:** https://sassyconsultingllc.com
**Privacy Policy:** https://privacy.sassyconsultingllc.com/foodie-finder

---

Built with ♠ by Sassy Consulting LLC — a Veteran-Owned company.
