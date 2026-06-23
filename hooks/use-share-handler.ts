/**
 * Share Intent Handler Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Handles URLs shared from Google Maps and other apps.
 * When a user shares a restaurant from Google Maps → we import it to their favorites.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import React from "react";
import * as Linking from "expo-linking";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";

const DEVICE_ID_KEY = "foodie_finder_device_id";

/**
 * Generate or retrieve a persistent device ID
 */
async function getDeviceId(): Promise<string> {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}

/**
 * Check if a URL is a Google Maps restaurant link.
 *
 * Defense in depth: the worker re-validates with parsed-hostname checks
 * before doing anything with the URL, but rejecting obvious non-matches
 * here saves a round-trip and makes the client-side intent explicit.
 *
 * Requirements:
 *   - https:// only (http would otherwise be a downgrade attack)
 *   - hostname must be one of the Google Maps domains (exact match), not a
 *     substring — `http://attacker.com/?x=maps.google.com` used to pass
 */
const ALLOWED_GMAPS_HOSTS = new Set([
  "maps.google.com",
  "www.google.com",
  "google.com",
  "goo.gl",
  "maps.app.goo.gl",
]);

function isGoogleMapsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_GMAPS_HOSTS.has(host)) return false;
  // google.com / www.google.com only counts when the path is /maps. The
  // shorteners count anywhere on their host.
  if (host === "google.com" || host === "www.google.com") {
    return parsed.pathname.startsWith("/maps");
  }
  return true;
}

/**
 * Extract URLs from shared text (handles "Check out X on Google Maps: <url>")
 */
function extractUrlFromText(text: string): string | null {
  // Match any URL in the text
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  return urlMatch ? urlMatch[0] : null;
}

interface ShareHandlerResult {
  isProcessing: boolean;
  // Server returns string IDs (e.g. "google_ChIJ...") — the previous
  // `number` type caused silent runtime mismatches when navigation
  // params were typed against this shape.
  lastImportedRestaurant: {
    name: string;
    id: string;
  } | null;
  error: string | null;
}

export function useShareHandler(): ShareHandlerResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastImportedRestaurant, setLastImportedRestaurant] = useState<{
    name: string;
    id: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // In-flight guard as a ref so a second share arriving before the next render
  // still sees it (state lags a render behind and let duplicate imports through).
  const isProcessingRef = useRef(false);

  const importMutation = trpc.restaurant.importFromShare.useMutation();

  const processSharedUrl = useCallback(async (url: string) => {
    // Skip if already processing
    if (isProcessingRef.current) return;

    // Check if it's a Google Maps URL — quietly drop non-matching URLs
    if (!isGoogleMapsUrl(url)) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    setError(null);

    try {
      const deviceId = await getDeviceId();

      const result = await importMutation.mutateAsync({
        url,
        userId: deviceId,
      });

      if (result.success && result.restaurant) {
        // Coerce to string so consumers can rely on the typed ID even if
        // the server ever returns a numeric form for legacy entries.
        setLastImportedRestaurant({
          name: result.restaurant.name,
          id: String(result.restaurantId),
        });
        // Clear any stale error from a prior failed import so the banner
        // doesn't linger after a successful one.
        setError(null);

        Alert.alert(
          "Added to Favorites! 🎉",
          `${result.restaurant.name} has been added to your favorites. You can now include it in the randomizer!`,
          [{ text: "Awesome!", style: "default" }]
        );
      } else {
        setError(result.error || "Failed to import restaurant");
        Alert.alert(
          "Import Failed",
          result.error || "Could not import this restaurant. Please try again.",
          [{ text: "OK" }]
        );
      }
    } catch (err) {
      console.error("[ShareHandler] Error:", err);
      setError("Network error. Please try again.");
      Alert.alert(
        "Connection Error",
        "Could not connect to the server. Please check your internet connection.",
        [{ text: "OK" }]
      );
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [importMutation]);

  const handleUrl = useCallback((event: { url: string }) => {
    const { url } = event;
    
    // Direct URL
    if (url.startsWith("http")) {
      processSharedUrl(url);
      return;
    }

    // Text share (might contain URL)
    const extractedUrl = extractUrlFromText(url);
    if (extractedUrl) {
      processSharedUrl(extractedUrl);
    }
  }, [processSharedUrl]);

  useEffect(() => {
    // Handle URL that launched the app
    const checkInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleUrl({ url: initialUrl });
      }
    };

    checkInitialUrl();

    // Listen for URLs while app is running
    const subscription = Linking.addEventListener("url", handleUrl);

    return () => {
      subscription.remove();
    };
  }, [handleUrl]);

  // Android-specific: Handle share intents
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const handleShareIntent = async () => {
      try {
        // expo-sharing doesn't expose received data, but Linking captures it
        // The intent filter in app.config.ts routes shares through Linking
      } catch (err) {
        console.error("[ShareHandler] Android intent error:", err);
      }
    };

    handleShareIntent();
  }, []);

  return {
    isProcessing,
    lastImportedRestaurant,
    error,
  };
}

/**
 * Component to wrap at app root to enable share handling
 */
export function ShareHandlerProvider({ children }: { children: React.ReactNode }) {
  const { isProcessing } = useShareHandler();
  
  // Could show a loading overlay when processing
  return React.createElement(React.Fragment, null, children);
}
