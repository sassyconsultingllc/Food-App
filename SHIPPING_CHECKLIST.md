# Foodie Finder - Shipping Checklist

© 2025 Sassy Consulting - A Veteran Owned Company

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

### 6. Backend Deployment

- [ ] Deploy server to production (Railway, Render, AWS, etc.)
- [ ] Set up production database (MySQL/PostgreSQL)
- [ ] Configure Redis for production
- [ ] Set up SSL certificates
- [ ] Configure environment variables on server
- [ ] Test all API endpoints

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
  - [ ] Random restaurant picker
  - [ ] GPS location detection
  - [ ] Browse and filter restaurants
  - [ ] Favorites save/remove
  - [ ] Restaurant details load
  - [ ] Share functionality
  - [ ] Dark mode toggle
  - [ ] Settings persistence
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

# Run tests
pnpm test

# Type check
pnpm check

# Start development
pnpm dev

# Build production
npx eas build --profile production --platform all
```

---

## Support

For questions about deployment, contact: support@sassyconsulting.com

*© 2025 Sassy Consulting - A Veteran Owned Company*
