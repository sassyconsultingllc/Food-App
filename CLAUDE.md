<!--
   Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
   Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
   CodeMark: SCLLC1-foodie_finder_v8-RLZZMZDTYEKE
-->
# Foodie Finder

Read this before changing anything. Search for existing code before writing new code; most features already have a hook, component or tRPC procedure.

## What it is
- **App:** Expo SDK 54 / React Native 0.81, TypeScript, expo-router (`app/`). Package `com.sassyconsultingllc.foodiefinder`. The `android/` folder is committed, so native values come from `android/app/build.gradle`, not `app.config.ts`.
- **Production API:** Cloudflare Worker in `worker/` (Hono + tRPC), deployed as `foodie-finder-api-prod` on `foodie-finder.sassyconsultingllc.com`. Bindings in `wrangler.toml`: D1 `DB`, Vectorize, Workers AI, R2 `MENU_PHOTOS`, KV `RATE_LIMIT` / `FOODIE_PUBLIC_NOTES` / `VISION_CACHE`.
- **`server/`:** an Express + tRPC + LangChain server for local development (`npm run dev:server`). It is not what production calls; the app talks to the Worker.
- **Data:** Google Places (search + Place Details for photos, hours, `utc_offset_minutes`), Culver's flavor API, Nominatim for reverse geocoding.

## Where to work
- Canonical checkout: `V:\Projects\foodie-finder v8` on Windows, `~/Projects/foodie-finder v8` on the Linux box (ClaudeSecure; CRLF, `core.autocrlf=true`). A clean clone also lives at `~/work/foodie-finder`. Check which copy is newer before editing.
- Remote: `github.com/sassyconsultingllc/Food-App`, branch `master`.
- Every source file starts with the copyright / CodeMark header. Keep it when editing, and add the two copyright lines to new files.

## Commands
- `npm ci`: install (use `package-lock.json`).
- `npx tsc --noEmit`: typecheck. `npx vitest run`: tests.
- `npm run worker:deploy:prod`: deploy the production Worker. Dry run first with `npx wrangler deploy --env=production --dry-run --outdir <dir>`, then check `/api/health` and a `restaurant.search` call afterwards.
- `npm run build`: bundle `server/` to `dist/`.

### Known issues
- `npx eslint` / `expo lint` crashes (`contextOrFilename.getFilename is not a function`): eslint 10 vs. eslint-plugin-react. Lint can't run until that's fixed.
- `__tests__/scraper-rag.test.ts` makes real network calls (Overpass and others) and times out intermittently. A timeout there is not a regression.

## How state is shared (read before touching storage or location)
- `useRestaurantStorage()` (`hooks/use-restaurant-storage.ts`) is called by every screen, and all tabs stay mounted. Preferences, favorites and personal notes therefore live in shared stores (`utils/shared-store.ts`): every hook instance reads, subscribes and publishes there. Never keep a per-screen copy and write it back to AsyncStorage. That was the cause of the zip, favorites and notes bugs fixed in 1.0.5 (vc31).
- Saves build on `store.get()`, not on React state. Background/unmount flushes write the shared value only when a module-level pending flag is set. Edits made before storage has loaded are ignored (with a warning) rather than replacing saved data.
- The active search (zip + radius) lives in `context/restaurant-search-context.tsx`. Home mirrors it into its inputs, so whichever screen changed the location last, every screen shows and searches the same area. "Use My Location" applies its GPS result whenever the user pressed it, even if a zip is saved.

## Releasing (Android)
1. Update `CHANGELOG.md` (format `## 1.0.x (vcN) - YYYY-MM-DD`).
2. Write the Play release notes for the build number N:
   - `fastlane/metadata/android/<locale>/changelogs/N.txt`, one per locale (30 locales as of vc31). **Play's limit is 500 characters per language.**
   - `fastlane/release-notes/N-play-console.txt`: the same notes as `<locale>…</locale>` blocks to paste into Play Console in one go.
   - The app UI is English-only, so the button names ("Use My Location", "View Full Menu") stay in English in every language.
3. `eas build -p android --profile production`. EAS is the source of truth for the version code (`appVersionSource: remote`, `autoIncrement`). It counts up on every build **request**, including failed ones, so check `eas build:version:get -p android` and `eas build:list` before assuming a number. Play never accepts a version code twice. Keep `versionCode` in `android/app/build.gradle` in sync for reference.
4. `eas submit -p android --profile production --id <build-id>` uploads a **draft** to the production track. Other profiles in `eas.json`: `internal`, `beta`, `production-staged` (10%), `production-full`. EAS does not upload release notes; paste them from step 2, then roll out in Play Console.
   - The submit profile reads the service-account key from `./keys/` (gitignored). Never commit or print it.

## History
- 1.0.5 (vc29) shipped the four restaurant-page items this file used to list: all unique photos (Worker Place Details, capped at 10), the menu under the photos, personal notes, and community tips with the PII guard (`utils/pii-guard.ts`, `components/public-notes-section.tsx`).
- vc30 was built on 2026-09-24 without the sync fixes and never reached Play. 1.0.5 vc31 carries the location / favorites / notes fixes.
- The production Worker went from 2026-08-09 until 2026-10-26 without a deploy; until then `utc_offset_minutes` and the photo cap weren't live. Deploy the Worker whenever `worker/` changes.
