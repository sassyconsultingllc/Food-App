#!/bin/bash

# Foodie Finder - Android Build Script
# Automates building APK/AAB with EAS Build

set -e

echo "╔══════════════════════════════════════════╗"
echo "║  🍔 Foodie Finder - Android Build       ║"
echo "║  v1.0.0                                  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI not found"
    echo "Install with: npm install -g eas-cli"
    exit 1
fi

# Check if logged in
if ! eas whoami &> /dev/null; then
    echo "❌ Not logged in to Expo"
    echo "Login with: eas login"
    exit 1
fi

# Build type
BUILD_TYPE="${1:-preview}"

echo "Build Type: $BUILD_TYPE"
echo ""

case $BUILD_TYPE in
  dev|development)
    echo "→ Building DEVELOPMENT APK..."
    echo "  - Development client"
    echo "  - Internal distribution"
    echo "  - Debug features enabled"
    echo ""
    eas build --platform android --profile development
    ;;
  
  preview|test)
    echo "→ Building PREVIEW APK (recommended for testing)..."
    echo "  - Release build"
    echo "  - APK format (installable)"
    echo "  - Internal distribution"
    echo "  - File size: ~50 MB"
    echo ""
    eas build --platform android --profile preview
    ;;
  
  prod|production)
    echo "→ Building PRODUCTION AAB (for Google Play)..."
    echo "  - Release build"
    echo "  - AAB format (optimized)"
    echo "  - Google Play Store"
    echo "  - File size: ~30 MB"
    echo ""
    eas build --platform android --profile production
    ;;
  
  *)
    echo "❌ Invalid build type: $BUILD_TYPE"
    echo ""
    echo "Usage: ./build-android.sh [dev|preview|prod]"
    echo ""
    echo "Options:"
    echo "  dev, development  - Development APK with dev features"
    echo "  preview, test     - Preview APK for testing (recommended)"
    echo "  prod, production  - Production AAB for Play Store"
    echo ""
    exit 1
    ;;
esac

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Build Started!                          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Monitor progress at:"
echo "https://expo.dev/accounts/[your-account]/projects/foodie-finder/builds"
echo ""
echo "Build typically takes 10-20 minutes."
echo "You'll receive an email when it's complete."
