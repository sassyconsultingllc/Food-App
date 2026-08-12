<!--
   Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
   Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
   CodeMark: SCLLC1-foodie_finder_v8-YKBUVVCGQ2V2
-->
# Changelog

All notable user-visible changes to Foodie Finder. Versions follow the
`major.minor.patch` pattern; the `(vcN)` suffix is the Android `versionCode`
used on Google Play.

The **Privacy Policy** linked from every release: <https://sassyconsultingllc.com/privacy/foodie-finder/>
The **Terms of Service** linked from every release: <https://sassyconsultingllc.com/privacy/foodie-finder/terms>


## 1.0.4 (vc27) - 2026-08-10

- Updating the app now clears cached restaurant data automatically, so a
  new version never shows results saved by the old one. Your Pro license,
  favorites, notes, and settings are kept.


<!-- vc22 and vc23 were consumed by EAS build requests that failed during
     upload/queueing; no artifact was ever produced for either. The EAS
     remote counter increments on request, not on success. -->


- The spinner now always opens the restaurant it landed on. Results
  refreshing mid-spin could leave the wheel showing one place while the
  detail screen opened another.
- "Open now" is now judged on the restaurant's local time instead of your
  phone's, so searching another area no longer shows places as open when
  they're closed.
- Fixed the Filters screen title overlapping the status bar on Android.
- Expired Pro licenses now prompt you to renew instead of showing a
  "contact support" message.
- Fixed a licensing check that could let premium helpers run without a
  valid license.
- Faster app-wide rendering: the license provider no longer re-renders
  every screen on each update.

## 1.0.3 (vc14) - 2026-07-28

- Location search keeps zip in sync and centers distances on the active area.
- Scraper filters malls, clubs, and attractions from restaurant results.
- UI: friendlier license activation errors and Fabric-safe community-tips auto-scroll.
- App fixes for More-Like-This/menu resolution and audit polish.
- Source files: standardized copyright/CodeMark headers across the repo.
## 1.0.2 (vc12) — pending rebuild

- **Photo Picker migration (Play Store compliance):** removed the
  `READ_MEDIA_IMAGES` permission. Menu-photo uploads and the profile
  picture now go through the Android Photo Picker (`PickVisualMedia`) on
  Android 13+ via `expo-image-picker` v17, which requires no runtime
  permission — the user picks one image at a time and the app never sees
  the rest of the gallery. This resolves the Play Store policy notice
  "Invalid use of the photo and video permissions" (apps with one-time
  or infrequent media access must use the Photo Picker, not
  `READ_MEDIA_IMAGES`). `READ_EXTERNAL_STORAGE` is retained with
  `maxSdkVersion="32"` for the legacy gallery path on Android 12 and
  below. Also added explicit `tools:node="remove"` strips for
  `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` so transitive dependencies
  cannot re-introduce them via manifest merger.

## 1.0.2 (vc8) — pending rebuild

- Settings → About now displays the live app version from `app.config.ts`
  (previously hardcoded to `1.0.0`, which drifted from the real binary).
- Settings → Legal now sources the Privacy / Terms URLs from
  `Constants.expoConfig.extra` so the runtime, build env, and on-screen
  link are all driven by the same source of truth (`eas.json`).
- Terms link in Settings dropped the dead `.html` suffix so it matches the
  canonical hosted URL.

## 1.0.2 (vc7) — 2026-05-15

- **Splash screen fix:** added an explicit `SplashScreen.hideAsync()` call
  on the first frame after `RootLayoutContent` mounts. Previously the
  expo-splash-screen plugin auto-called `preventAutoHide()` at boot but
  nothing was hiding it once the RN tree was ready, leaving the splash up
  forever on some devices.

## 1.0.1 (vc4) — 2026-05-11

- **Spinner wheel cap removed:** every filtered restaurant is now eligible
  for a spin (previously a 39-match filter would only ever land on the
  first 20).
- **Spinner loading state:** the empty-wheel state during initial fetch
  now shows a copper spinner with "Sifting through nearby spots…"
- **Tab-bar-safe draw area:** the wheel and result overlay now respect
  the tab bar + safe-area insets so the wheel never hides behind the
  bottom navigation in 3-button or gesture nav.
- **Clear-All chip reflow:** the Clear-All chip moved out of the
  horizontal chip scroll into its own row next to the match-count pill,
  so it no longer gets clipped at the right edge on 360 dp phones.
- **Menu auto-discovery:** restaurant detail now auto-discovers the real
  menu URL or PDF per restaurant instead of just linking to the website
  homepage.
- **Filter occlusion fix:** the spinning wheel no longer overlaps the
  filter chips.
- **Contact Support:** now opens our tester signup page rather than a
  mailto link.
- **Play Store readiness:**
  - Stripped `SYSTEM_ALERT_WINDOW`, `RECORD_AUDIO`, and
    `WRITE_EXTERNAL_STORAGE` permissions (none were actually used).
  - Added `READ_MEDIA_IMAGES` (API 33+), `READ_EXTERNAL_STORAGE`
    (gated to API 32), and `CAMERA` (was missing despite the menu-photo
    flow calling `launchCameraAsync`).
  - Fixed privacy/terms URLs (the old `privacy.sassyconsultingllc.com`
    subdomain 404'd).

## 1.0.0 (vc3) — initial Play Store submission

- Random restaurant picker with spinner wheel and filter chips (cuisine,
  price, dietary, open now).
- Natural-language semantic search.
- GPS + postal-code location detection (international postal-code
  validation).
- Aggregated ratings from Google Places + Foursquare + HERE.
- Favorites, recently-viewed history, taste-based recommendations.
- Personal notes (on-device, private) and community tips (shared,
  rate-limited, content-moderated).
- Menu photo classification via Google Vision.
- Culver's Flavor of the Day calendar.
- Google Maps share import.
- Dark / light / system theme.
- Sound settings (UI feedback only — no microphone access).
