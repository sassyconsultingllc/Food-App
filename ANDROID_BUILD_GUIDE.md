# 🍔 Foodie Finder - Android Build & Packaging Guide
## Complete Guide to Building APK/AAB with Expo EAS Build

**App:** Foodie Finder  
**Version:** 1.0.0  
**Package:** space.sassy.foodie.finder.t20251222143704  
**Date:** January 14, 2025

---

## 📋 PREREQUISITES

### Required Installations
```bash
# Node.js 18+ (check version)
node --version

# pnpm (package manager)
npm install -g pnpm

# Expo CLI
npm install -g expo-cli

# EAS CLI (for building)
npm install -g eas-cli
```

### Verify Installation
```bash
node --version    # Should be 18.0.0+
pnpm --version    # Should be 9.12.0+
expo --version    # Should be latest
eas --version     # Should be latest
```

---

## 🚀 QUICK START BUILD

### Option 1: APK (Preview Build - For Testing)
```bash
cd "V:\Projects\foodie-finder v8"

# Install dependencies
pnpm install

# Login to Expo
eas login

# Build APK for testing
eas build --platform android --profile preview
```

**Output:** APK file (~50 MB) - Can install directly on devices

### Option 2: AAB (Production Build - For Google Play)
```bash
cd "V:\Projects\foodie-finder v8"

# Build AAB for Google Play
eas build --platform android --profile production
```

**Output:** AAB file (~30 MB) - Upload to Google Play Console

---

## 📦 BUILD PROFILES

Your `eas.json` has 3 profiles configured:

### 1. Development Profile
```bash
eas build --platform android --profile development
```
- **Purpose:** Development testing with Expo Dev Client
- **Output:** APK with dev features
- **Distribution:** Internal only
- **Use Case:** Developer testing, debugging

### 2. Preview Profile ⭐ (RECOMMENDED FOR TESTING)
```bash
eas build --platform android --profile preview
```
- **Purpose:** Pre-release testing
- **Output:** APK (installable file)
- **Distribution:** Internal testers
- **Use Case:** Beta testing, client demos
- **File Size:** ~50 MB

### 3. Production Profile ⭐ (RECOMMENDED FOR PLAY STORE)
```bash
eas build --platform android --profile production
```
- **Purpose:** Google Play Store release
- **Output:** AAB (Android App Bundle)
- **Distribution:** Google Play Store
- **Use Case:** Public release
- **File Size:** ~30 MB (optimized)

---

## 🔨 DETAILED BUILD PROCESS

### Step 1: Prepare Project
```bash
cd "V:\Projects\foodie-finder v8"

# Install all dependencies
pnpm install

# Check for TypeScript errors
pnpm check

# Verify build configuration
cat eas.json
```

### Step 2: Login to Expo
```bash
# Login (only needed once)
eas login

# Verify login
eas whoami
```

### Step 3: Build APK (Testing)
```bash
# Start APK build
eas build --platform android --profile preview

# Monitor build progress
# Build runs on Expo's cloud servers
# Takes 10-20 minutes typically
```

### Step 4: Download APK
Once build completes:
```bash
# Download will be prompted automatically
# Or visit: https://expo.dev/accounts/[your-account]/projects/foodie-finder/builds

# File will be named something like:
# foodie-finder-1234567890abcdef.apk
```

### Step 5: Install APK on Device
```bash
# Option A: Via ADB
adb install foodie-finder-*.apk

# Option B: Transfer to device and install manually
# (Device must have "Install from Unknown Sources" enabled)
```

---

## 🏪 GOOGLE PLAY STORE SUBMISSION

### Step 1: Build Production AAB
```bash
eas build --platform android --profile production
```

### Step 2: Generate Service Account (First Time Only)

**In Google Play Console:**
1. Go to Settings → API Access
2. Create new service account
3. Download JSON key file
4. Save as `google-service-account.json` in project root

### Step 3: Upload to Play Store
```bash
# Manual upload via Google Play Console
# OR automated upload:
eas submit --platform android --profile production

# This will:
# - Upload the AAB to Google Play
# - Create internal testing track release
# - Requires google-service-account.json
```

### Step 4: Google Play Console Setup
1. **App Information**
   - App name: Foodie Finder
   - Short description: Find great food near you
   - Full description: (write compelling description)
   - Category: Food & Drink
   - Tags: food, restaurant, dining

2. **Store Listing**
   - Upload screenshots (at least 2)
   - Upload app icon (512x512 PNG)
   - Upload feature graphic (1024x500 PNG)

3. **Content Rating**
   - Complete questionnaire
   - Should get "Everyone" rating

4. **App Content**
   - Privacy policy URL
   - Target age group
   - Data safety form

5. **Pricing & Distribution**
   - Free or Paid
   - Countries to distribute
   - Content guidelines

6. **Release**
   - Internal testing → Closed testing → Open testing → Production
   - Start with internal testing
   - Add testers by email
   - Review release notes

---

## 🛠️ BUILD SCRIPTS (AUTOMATED)

I'll create helper scripts for you:

### build-android.sh
```bash
#!/bin/bash
# Quick build script for Android

echo "🍔 Foodie Finder - Android Build"
echo "================================="
echo ""

# Build type
BUILD_TYPE="${1:-preview}"

case $BUILD_TYPE in
  dev|development)
    echo "→ Building DEVELOPMENT APK..."
    eas build --platform android --profile development
    ;;
  
  preview)
    echo "→ Building PREVIEW APK (recommended for testing)..."
    eas build --platform android --profile preview
    ;;
  
  prod|production)
    echo "→ Building PRODUCTION AAB (for Google Play)..."
    eas build --platform android --profile production
    ;;
  
  *)
    echo "❌ Invalid build type: $BUILD_TYPE"
    echo "Usage: ./build-android.sh [dev|preview|prod]"
    exit 1
    ;;
esac
```

### submit-android.sh
```bash
#!/bin/bash
# Submit to Google Play Store

echo "🍔 Foodie Finder - Submit to Play Store"
echo "========================================"
echo ""

# Check for service account
if [ ! -f "google-service-account.json" ]; then
    echo "❌ Missing google-service-account.json"
    echo "Please download from Google Play Console:"
    echo "Settings → API Access → Service Accounts"
    exit 1
fi

echo "→ Submitting to Google Play (internal track)..."
eas submit --platform android --profile production
```

---

## 📱 TESTING APK

### On Physical Device
```bash
# Enable USB debugging on device
# Settings → Developer Options → USB Debugging

# Connect device via USB
adb devices

# Install APK
adb install -r foodie-finder-*.apk

# Launch app
adb shell am start -n space.sassy.foodie.finder.t20251222143704/.MainActivity
```

### On Emulator
```bash
# Start Android emulator
emulator -avd Pixel_5_API_34

# Install APK
adb install foodie-finder-*.apk
```

### Beta Testing via Google Play
1. Upload AAB to Internal Testing
2. Add tester emails
3. Testers receive email with link
4. Install from Play Store

---

## 🔍 TROUBLESHOOTING

### Build Fails - "ANDROID_SDK_ROOT not set"
```bash
# Install Android SDK via Android Studio
# Or set manually:
export ANDROID_SDK_ROOT=/path/to/android-sdk
```

### Build Fails - "Credentials required"
```bash
# Remove old credentials
eas credentials:reset --platform android

# Rebuild
eas build --platform android --profile preview
```

### APK Won't Install
```bash
# Check if device allows unknown sources
# Settings → Security → Unknown Sources → Enable

# Or use ADB
adb install -r foodie-finder-*.apk
```

### AAB Upload Fails
```bash
# Check google-service-account.json exists
ls -la google-service-account.json

# Verify JSON format
cat google-service-account.json | jq

# Try manual upload via Play Console
```

### Build Taking Too Long
```bash
# Check build status
eas build:list

# View specific build
eas build:view [build-id]

# Cancel stuck build
eas build:cancel [build-id]
```

---

## 📊 BUILD COMPARISON

| Build Type | File Type | Size | Use Case | Distribution |
|------------|-----------|------|----------|--------------|
| Development | APK | ~60 MB | Dev testing | Internal only |
| Preview | APK | ~50 MB | Beta testing | Internal/testers |
| Production | AAB | ~30 MB | Play Store | Public release |

### APK vs AAB

**APK (Android Package)**
- ✅ Can install directly on devices
- ✅ Good for testing/demos
- ✅ Works without Play Store
- ❌ Larger file size
- ❌ Not optimized per device

**AAB (Android App Bundle)**
- ✅ Smaller download size
- ✅ Optimized per device
- ✅ Required for Play Store
- ❌ Can't install directly
- ❌ Needs Play Store to distribute

---

## 🎯 RECOMMENDED WORKFLOW

### For Development/Testing
```bash
# 1. Build preview APK
eas build --platform android --profile preview

# 2. Download APK
# (Expo will provide download link)

# 3. Install on device
adb install foodie-finder-*.apk

# 4. Test app
# 5. Iterate and rebuild as needed
```

### For Production Release
```bash
# 1. Build production AAB
eas build --platform android --profile production

# 2. Test internally first
eas submit --platform android --profile production
# (Uploads to internal testing track)

# 3. Get feedback from testers

# 4. Promote to production when ready
# (Do this in Google Play Console)
```

---

## 📝 CHECKLIST BEFORE SUBMISSION

### Code
- [ ] All features working
- [ ] No console errors
- [ ] Performance optimized
- [ ] Memory leaks fixed
- [ ] Network errors handled

### Assets
- [ ] App icon (512x512 PNG)
- [ ] Splash screen
- [ ] Feature graphic (1024x500 PNG)
- [ ] Screenshots (at least 2, max 8)
- [ ] Promo video (optional)

### Legal
- [ ] Privacy policy URL
- [ ] Terms of service
- [ ] Data safety questionnaire
- [ ] Content rating questionnaire
- [ ] Export compliance

### Google Play Console
- [ ] App name finalized
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] Category selected
- [ ] Contact email
- [ ] Support website

### Build
- [ ] Production AAB built
- [ ] Version code incremented
- [ ] Release notes written
- [ ] AAB uploaded
- [ ] Internal testing complete

---

## 🔐 SECURITY NOTES

### Signing Keys
- EAS Build manages signing keys automatically
- Keys stored securely in Expo's servers
- Can download keystore if needed:
  ```bash
  eas credentials --platform android
  ```

### Obfuscation
Your project has `obfuscator.config.js` configured:
```bash
# Build with obfuscation
pnpm build:protected

# Then create Expo build
eas build --platform android --profile production
```

---

## 📞 SUPPORT

### Expo Build Logs
```bash
# View all builds
eas build:list

# View specific build
eas build:view [build-id]

# Download build logs
eas build:logs [build-id]
```

### Useful Links
- Expo Docs: https://docs.expo.dev
- EAS Build: https://docs.expo.dev/build/introduction/
- Google Play Console: https://play.google.com/console
- Your Builds: https://expo.dev/accounts/[your-account]/projects/foodie-finder/builds

---

## 🎉 QUICK COMMANDS REFERENCE

```bash
# Install dependencies
pnpm install

# Build APK for testing
eas build --platform android --profile preview

# Build AAB for Play Store
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android --profile production

# Check build status
eas build:list

# View specific build
eas build:view [build-id]

# Install APK on device
adb install foodie-finder-*.apk
```

---

**Ready to build!** Start with a preview APK for testing, then move to production AAB for Play Store submission.

🍔 Happy building!
