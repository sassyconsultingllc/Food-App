// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Production bundle / package ID. Reverse-domain of sassyconsultingllc.com
// + app slug. Locked once published to Play Store / App Store — DO NOT
// change without coordinating a fresh app listing.
const bundleId = "com.sassyconsultingllc.foodiefinder";
// Custom-scheme deep link prefix for in-app routing (`foodiefinder://...`).
// Independent of the bundle ID so we can pick something human-readable.
const schemeFromBundleId = "foodiefinder";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: 'Foodie Finder',
  appSlug: 'foodie-finder',
  // S3 URL of the app logo
  logoUrl: '',
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.2",
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      // iOS Share Extension settings
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: "URL",
          LSHandlerRank: "Alternate",
          LSItemContentTypes: ["public.url", "public.text"],
        },
      ],
      LSApplicationQueriesSchemes: ["comgooglemaps", "maps"],
    },
    associatedDomains: [
      "applinks:wellknown.sassyconsultingllc.com",
    ],
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#6BA3BE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      // Custom scheme for deep links
      {
        action: "VIEW",
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
      // Verified domain for app links and credential sharing
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: "wellknown.sassyconsultingllc.com",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
      // Receive shares from Google Maps
      {
        action: "SEND",
        category: ["DEFAULT"],
        data: [
          {
            mimeType: "text/plain",
          },
        ],
      },
      // Handle Google Maps URLs directly (no autoVerify - we don't own these domains)
      {
        action: "VIEW",
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: "https",
            host: "maps.google.com",
          },
          {
            scheme: "https",
            host: "www.google.com",
            pathPrefix: "/maps",
          },
          {
            scheme: "https",
            host: "goo.gl",
            pathPrefix: "/maps",
          },
          {
            scheme: "https",
            host: "maps.app.goo.gl",
          },
        ],
      },
    ],
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-asset",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#6BA3BE",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Foodie Finder needs photo access so you can upload menu photos for other diners.",
        cameraPermission:
          "Foodie Finder needs camera access so you can take menu photos.",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Foodie Finder uses your location to find nearby restaurants.",
      },
    ],
    [
      "expo-audio",
      {
        // Playback-only — no recording in the app (only useAudioPlayer for
        // UI sounds via hooks/use-app-sounds.ts). Keep RECORD_AUDIO and the
        // iOS NSMicrophoneUsageDescription out so Play Store / App Store
        // don't classify this as a microphone-using app.
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "fc6c0d91-696b-4c6f-9ee3-a1868c732988",
    },
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || 'https://sassyconsultingllc.com/privacy/foodie-finder/',
    termsOfServiceUrl: process.env.EXPO_PUBLIC_TERMS_URL || 'https://sassyconsultingllc.com/privacy/foodie-finder/terms',
    supportEmail: 'info@sassyconsultingllc.com',
  },
};

export default config;
