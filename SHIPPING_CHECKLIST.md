# Foodie Finder - Shipping Checklist

© 2025-2026 Sassy Consulting - A Veteran Owned Company

**Last Updated:** 2026-05-15 | **App Version:** 1.0.2 | **Package:** com.sassyconsultingllc.foodiefinder

## Pre-Submission Checklist

### 1. App Store Accounts Setup

#### Apple App Store
- [ ] Apple Developer Program membership ($99/year)
- [ ] App Store Connect account created
- [ ] Set `APPLE_ID` environment variable (your Apple ID email)
- [ ] Set `ASC_APP_ID` environment variable (from App Store Connect)
- [ ] Set `APPLE_TEAM_ID` environment variable (from developer portal)

#### Google Play Store
- [ ] Google Play Developer account ($25 one-time)
- [ ] Create service account in Google Cloud Console
- [ ] Download JSON key and save to `./keys/google-service-account.json`
- [ ] Grant service account access in Play Console (Admin > API access)

### 2. Required Legal Pages

Create and host these pages before submission:

- [x] **Privacy Policy** - Required by both stores
  - URL: `https://privacy.sassyconsultingllc.com/foodie-finder`
  - Must disclose: data collection, usage, third-party sharing, user rights
  
- [ ] **Terms of Service** - Recommended
  - URL: `https://privacy.sassyconsultingllc.com/foodie-finder/terms`

### 3. App Assets Verification

All assets are in `./assets/images/`:

- [x] `icon.png` - App icon (1024x1024)
- [x] `splash-icon.png` - Splash screen icon
- [x] `favicon.png` - Web favicon
- [x] `android-icon-foreground.png` - Android adaptive icon
- [x] `android-icon-background.png` - Android adaptive icon background
- [x] `android-icon-monochrome.png` - Android monochrome icon

### 4. App Store Metadata (Prepare in Advance)

#### Required for Both Stores
- [ ] App name: **Foodie Finder**
- [ ] Short description (80 chars): "Discover local restaurants with a fun random picker!"
- [ ] Full description (4000 chars max)
- [ ] Category: Food & Drink
- [ ] Keywords/Tags
- [ ] Support email: info@sassyconsultingllc.com

#### Screenshots Required
- [ ] iPhone 6.7" (1290 x 2796) - at least 3
- [ ] iPhone 6.5" (1284 x 2778) - at least 3
- [ ] iPad Pro 12.9" (2048 x 2732) - if supporting tablets
- [ ] Android Phone (1080 x 1920 minimum) - at least 4
- [ ] Android Tablet (if supporting)

### 5. Environment Configuration

#### Production Environment Variables
```bash
# Set these in EAS Secrets (https://expo.dev/accounts/[your-account]/projects/foodie-finder/secrets)
EXPO_PUBLIC_LICENSE_SERVER_URL=https://your-deployed-server.com
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://privacy.sassyconsultingllc.com/foodie-finder
EXPO_PUBLIC_TERMS_URL=https://privacy.sassyconsultingllc.com/foodie-finder/terms

# App Store submission credentials
APPLE_ID=your-apple-id@example.com
ASC_APP_ID=your-app-store-connect-app-id
APPLE_TEAM_ID=your-apple-team-id
```

### 6. Backend Deployment (Cloudflare Workers)

- [ ] Deploy Cloudflare Worker to production (`npx wrangler deploy --env=production`)
- [ ] Create D1 database (`foodie-finder`) and run schema (`worker/schema.sql`)
- [ ] Create KV namespaces (`FOODIE_PUBLIC_NOTES`, `RATE_LIMIT`)
- [ ] Create R2 bucket (`MENU_PHOTOS`)
- [ ] Set up Vectorize index for semantic search
- [ ] Set secrets via `wrangler secret put` (GOOGLE_PLACES_API_KEY, FOURSQUARE_API_KEY, HERE_API_KEY, JWT_SECRET)
- [ ] Test all tRPC endpoints
- [ ] Verify content moderation and rate limiting work in production

### 7. Build & Submit Commands

#### First-Time Setup
```bash
# Login to EAS
npx eas login

# Configure EAS project (if not done)
npx eas build:configure
```

#### Build for Testing
```bash
# Build preview APK for Android testing
npx eas build --profile preview --platform android

# Build preview for iOS testing (requires Apple Developer account)
npx eas build --profile preview --platform ios
```

#### Production Build & Submit
```bash
# Build production for Android
npx eas build --profile production --platform android

# Build production for iOS
npx eas build --profile production --platform ios

# Submit to stores (after build completes)
npx eas submit --platform android
npx eas submit --platform ios
```

### 8. Pre-Launch Testing

- [ ] Test on physical Android device
- [ ] Test on physical iOS device (TestFlight)
- [ ] Verify all features work:
  - [ ] Random restaurant picker (spinner wheel with filters)
  - [ ] GPS location detection
  - [ ] Browse and filter restaurants (cuisine, price, dietary, open now)
  - [ ] Natural-language semantic search
  - [ ] Favorites save/remove
  - [ ] Taste-based recommendations (in your area + travel)
  - [ ] Restaurant details load (photos, menu section, community tips)
  - [ ] Community tips post and display
  - [ ] Personal notes (on-device)
  - [ ] Menu photo classification (Google Vision)
  - [ ] Google Maps share import
  - [ ] Share functionality
  - [ ] Dark mode toggle
  - [ ] Sound settings
  - [ ] Settings persistence
  - [ ] Culver's Flavor of the Day calendar
- [ ] Test offline behavior
- [ ] Test on different screen sizes

### 9. App Store Review Preparation

#### Apple-Specific
- [ ] Prepare demo account (if login required)
- [ ] Review Apple's App Store Review Guidelines
- [ ] Ensure no placeholder content
- [ ] Test on latest iOS version

#### Google-Specific
- [ ] Complete Data Safety form in Play Console
- [ ] Set up app content rating questionnaire
- [ ] Configure target audience and content

---

## Quick Start Commands

```bash
# Install dependencies
pnpm install

# Run tests (22 test files, Vitest 4.x)
pnpm test

# Type check (TypeScript 5.9.3)
pnpm check

# Lint
pnpm lint

# Start development (Metro bundler + local tRPC server)
pnpm dev

# Start Cloudflare Worker local dev
pnpm worker:dev

# Build production
npx eas build --profile production --platform all

# Deploy Cloudflare Worker
pnpm worker:deploy:prod
```

---

## Support

For questions about deployment, contact: info@sassyconsultingllc.com

*© 2025-2026 Sassy Consulting - A Veteran Owned Company*
