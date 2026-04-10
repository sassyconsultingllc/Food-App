import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, View, ActivityIndicator, Text, StyleSheet } from "react-native";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemeProvider, useTheme } from "@/contexts/theme-context";
import { RestaurantSearchProvider } from "@/context/restaurant-search-context";
import { useAppSounds } from "@/hooks/use-app-sounds";
import { useShareHandler } from "@/hooks/use-share-handler";
import { initSassyRuntime, subscribeSafeAreaInsets } from "@/lib/sassy-runtime";
import { ErrorBoundary } from "@/components/error-boundary";
import { validateEnvironment } from "@/lib/env-validator";
import { trpc, createTRPCClient } from "@/lib/trpc";

/**
 * Invisible bridge that sits inside the tRPC provider tree and mounts the
 * share-intent listener exactly once. Without this, Google Maps "Share →
 * Foodie Finder" does nothing because `useShareHandler` is never called.
 */
function ShareHandlerBridge() {
  useShareHandler();
  return null;
}


const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };
// Web iframe previewer cannot infer safe-area; default to zero until container sends metrics.

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootLayoutContent() {
  const { effectiveTheme } = useTheme();
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Play app-open sound on first mount
  const { playSound } = useAppSounds(true);
  useEffect(() => {
    playSound("appOpen");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize Sassy runtime for cookie injection from parent container
  useEffect(() => {
    initSassyRuntime();
  }, []);

  // Validate environment variables in development
  useEffect(() => {
    if (__DEV__) {
      try {
        validateEnvironment();
      } catch (error) {
        console.error('[App] Environment validation failed:', error);
      }
    }
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );

  const [trpcClient] = useState(() => createTRPCClient());

  const providerInitialMetrics = useMemo(
    () => initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame },
    [initialFrame, initialInsets],
  );

  const appContent = (
    <RestaurantSearchProvider>
      <ErrorBoundary>
        <ShareHandlerBridge />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
          <Stack.Screen name="restaurant/[id]" options={{ headerShown: false }} />
        </Stack>
      </ErrorBoundary>
    </RestaurantSearchProvider>
  );

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <NavigationThemeProvider value={effectiveTheme === "dark" ? DarkTheme : DefaultTheme}>
            {appContent}
            <StatusBar style="auto" />
          </NavigationThemeProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>
        <SafeAreaFrameContext.Provider value={frame}>
          <SafeAreaInsetsContext.Provider value={insets}>{content}</SafeAreaInsetsContext.Provider>
        </SafeAreaFrameContext.Provider>
      </SafeAreaProvider>
    );
  }

  return <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}

