# Foodie Finder - Bug Fixes & Missing Features

## IMPORTANT: Read this entire document before making any changes. Search for existing code before creating new code.

## System Context
- Expo React Native app (TypeScript)
- Worker backend on Cloudflare (Hono + tRPC)
- Google Places API for restaurant data
- KV namespace for public notes (FOODIE_PUBLIC_NOTES binding in wrangler)
- R2 bucket for menu photos (MENU_PHOTOS binding in wrangler)
- Project root: V:\Projects\foodie-finder v8

## Bug 1: Photos - Only one image shown three times instead of all available photos

### Problem
The worker scraper at `worker/scraper.ts` line 301 limits Google Places photos to 3:
```
photos: p.photos?.slice(0, 3)
```
But the Google Places SEARCH results only return 1 photo_reference per restaurant anyway. The detail enrichment at `server/restaurant-scraper.ts` line 518 fetches up to 20, but that enrichment doesn't always run.

### Root Cause
The basic scraper (worker/scraper.ts) is the primary data source for most restaurants. It only gets 1 photo from the search API and slices to 3. The detail enrichment (server/restaurant-scraper.ts) that fetches the full 20 photos from Google Place Details API is a separate code path.

### Fix
1. In `worker/scraper.ts`, when building restaurant records from Google Places search, trigger a Place Details call for EACH restaurant to get all photos (up to 10 to manage API costs). Change line 301 from `slice(0, 3)` to `slice(0, 10)`.
2. More importantly, the scraper needs to call the Place Details API to get the `photos` array (search results only give 1 photo). Look at `server/restaurant-scraper.ts` lines 496-531 for the `enrichWithGoogleDetails()` function pattern. The worker scraper needs the same enrichment.
3. In `worker/scraper.ts`, after building the initial record from search, call Place Details with `fields=photos` and merge those photos into the record.
4. Make sure `hooks/use-restaurant-storage.ts` line 295 preserves all photos: `photos: [...new Set(serverRestaurant.photos || [])]` -- this is already correct, just verify deduplication works.
5. Verify `components/photo-carousel.tsx` renders unique photos -- it uses `keyExtractor={(item, index) => photo-${index}` which is fine, but also check that the `photos` array passed to it doesn't contain duplicates.

### Files to modify
- `worker/scraper.ts` (lines ~280-310) - increase photo fetch, add detail enrichment
- `server/restaurant-scraper.ts` - verify enrichment runs for all restaurants, not just some

## Bug 2: Menu section buried and hard to find

### Problem  
The `MenuSection` component exists at `components/menu-section.tsx` and is rendered in `app/restaurant/[id].tsx` at line 489, but it's buried between Hours/Contact info and Popular Dishes. It should be prominent and easy to find.

### Fix
1. In `app/restaurant/[id].tsx`, move the MenuSection to be directly after the PhotoCarousel (around line 312), before the ratings/hours sections.
2. Give it a prominent header with a menu icon.
3. The MenuSection component already supports: Google Places photos, user-uploaded photos via R2, and external menu URL links. Make sure all three are visible.
4. If the restaurant has a `menu.url`, show a prominent "View Full Menu" button at the top of the section.

### Files to modify
- `app/restaurant/[id].tsx` - move MenuSection higher in the layout

## Bug 3: Personal Notes modal exists but is NOT wired into the restaurant detail page

### Problem
`components/personal-notes-modal.tsx` exists with full UI (quick notes, free text input, save/cancel) but is NEVER imported or used in `app/restaurant/[id].tsx`.

### Fix
1. Import `PersonalNotesModal` in `app/restaurant/[id].tsx`
2. Add a "Personal Notes" button in the restaurant detail page (near the favorite/share buttons)
3. Wire up the modal with the existing `useRestaurantStorage` hook which already has note save/load logic
4. Show saved personal notes inline on the restaurant card when they exist

### Files to modify
- `app/restaurant/[id].tsx` - import and wire up PersonalNotesModal

## Bug 4: Public Notes ("Tell Others") - Backend exists, NO frontend component

### Problem
The full backend for public notes exists in TWO places:
- `server/restaurant-router.ts` lines 286-320: `getPublicNotes` and `addPublicNote` tRPC procedures (with in-memory Map storage)
- `worker/trpc-router.ts` lines 648-715: Same procedures but using KV namespace (`FOODIE_PUBLIC_NOTES`)

The PII guard exists at `utils/pii-guard.ts` (or wherever it is in the project) with:
- `checkForPII()` - detects phone numbers, emails, SSN, addresses, credit cards
- `moderateContent()` - blocks profanity, slurs, threats, spam
- `checkPublicNote()` - combined check that runs both

But there is NO UI component for public notes. No `public-notes-section.tsx` or similar exists.

### What to build
Create `components/public-notes-section.tsx` that:
1. Shows existing public notes for the restaurant (fetched via `getPublicNotes` tRPC call)
2. Has an "Add a tip" input with optional display name
3. Runs `checkPublicNote()` from `utils/pii-guard.ts` BEFORE submitting:
   - If content moderation BLOCKS: show error, don't submit
   - If PII detected (warning): show warning dialog "This may contain personal info (email/phone). Public notes are visible to everyone. Continue anyway?" with Yes/No
   - If clean: submit via `addPublicNote` tRPC call
4. Each note displays: display name (or "Anonymous"), text, relative timestamp
5. Notes are sorted newest first
6. Visual distinction from personal notes (personal = private/yellow, public = shared/blue or green)

### Wire it into the restaurant detail page
Add the PublicNotesSection to `app/restaurant/[id].tsx` BELOW the PersonalNotes section. Two distinct sections:
- "My Notes" (private, personal-notes-modal)
- "Community Tips" (public, public-notes-section)

### Files to create
- `components/public-notes-section.tsx`

### Files to modify  
- `app/restaurant/[id].tsx` - import and render PublicNotesSection

### Existing code to USE (don't recreate)
- `utils/pii-guard.ts` - checkPublicNote(), checkForPII(), moderateContent()
- `server/restaurant-router.ts` - getPublicNotes, addPublicNote procedures
- `worker/trpc-router.ts` - same procedures with KV backend
- wrangler.toml should already have FOODIE_PUBLIC_NOTES KV binding (verify)

## Order of operations
1. Fix photos (Bug 1) - most visible improvement
2. Move menu section (Bug 2) - quick layout change  
3. Wire personal notes (Bug 3) - component exists, just needs wiring
4. Build + wire public notes (Bug 4) - new component + wiring

## Testing
After each fix, run `npx expo start` and test on a real device or emulator. Check:
- Photo carousel shows multiple unique photos per restaurant
- Menu section is visible without deep scrolling
- Personal notes save and display correctly
- Public notes submit, PII warning triggers on phone numbers/emails, blocked content gets rejected
