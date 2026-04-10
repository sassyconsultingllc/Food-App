#!/bin/bash

# Foodie Finder - Submit to Google Play Store
# Automates submission via EAS Submit

set -e

echo "╔══════════════════════════════════════════╗"
echo "║  🍔 Foodie Finder - Play Store Submit   ║"
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

# Check for service account key
if [ ! -f "google-service-account.json" ]; then
    echo "❌ Missing google-service-account.json"
    echo ""
    echo "To create service account:"
    echo "1. Go to Google Play Console"
    echo "2. Settings → API Access"
    echo "3. Create new service account"
    echo "4. Download JSON key"
    echo "5. Save as 'google-service-account.json' in project root"
    echo ""
    exit 1
fi

echo "✓ Service account key found"
echo ""

# Submission type
TRACK="${1:-internal}"

case $TRACK in
  internal)
    echo "→ Submitting to INTERNAL TESTING track..."
    echo "  - Limited to 100 testers"
    echo "  - No review required"
    echo "  - Available immediately"
    ;;
  
  alpha)
    echo "→ Submitting to ALPHA (closed testing) track..."
    echo "  - Limited to invited testers"
    echo "  - Faster review"
    ;;
  
  beta)
    echo "→ Submitting to BETA (open testing) track..."
    echo "  - Open to anyone"
    echo "  - Requires review"
    ;;
  
  production)
    echo "→ Submitting to PRODUCTION track..."
    echo "  - Public release"
    echo "  - Full review required"
    echo "  - 1-7 days review time"
    ;;
  
  *)
    echo "❌ Invalid track: $TRACK"
    echo ""
    echo "Usage: ./submit-android.sh [internal|alpha|beta|production]"
    echo ""
    echo "Tracks:"
    echo "  internal    - Internal testing (100 testers, instant)"
    echo "  alpha       - Closed testing (invited testers)"
    echo "  beta        - Open testing (public opt-in)"
    echo "  production  - Public release (full review)"
    echo ""
    exit 1
    ;;
esac

echo ""
echo "⚠️  IMPORTANT:"
echo "This will submit the LATEST production build."
echo "Make sure you've tested it thoroughly!"
echo ""

read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Submission cancelled."
    exit 0
fi

echo ""
echo "→ Starting submission..."
echo ""

# Submit to Play Store
eas submit --platform android --profile production --track "$TRACK"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Submission Complete!                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Check status in Google Play Console:"
echo "https://play.google.com/console"
echo ""

if [ "$TRACK" = "internal" ]; then
    echo "Next steps:"
    echo "1. Go to Google Play Console"
    echo "2. Testing → Internal testing"
    echo "3. Add tester emails"
    echo "4. Share testing link with testers"
elif [ "$TRACK" = "production" ]; then
    echo "Review typically takes 1-7 days."
    echo "You'll receive an email when status changes."
fi
