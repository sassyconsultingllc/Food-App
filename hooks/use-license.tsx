/**
 * License & Paywall React API
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Provider + hook + gate components for the paywall. In evaluation mode
 * (the default while the app store listing is free), every feature is
 * unlocked and FeatureGate renders its children unchanged. Flip
 * EXPO_PUBLIC_PAYWALL_MODE=enforced to activate real gating.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import {
  type LicenseRecord,
  type LicenseTier,
  type PremiumFeature,
  activateLicense,
  daysRemaining,
  deactivateLicense,
  effectiveTier,
  getPaywallMode,
  hasFeature,
  isEvaluationMode,
  loadLicense,
  touchValidation,
} from "@/lib/license";

interface LicenseContextValue {
  isLoading: boolean;
  isValid: boolean; // true if user has any active tier (evaluation always true)
  license: LicenseRecord | null;
  tier: LicenseTier;
  mode: ReturnType<typeof getPaywallMode>;
  daysRemaining: number | null;
  has: (feature: PremiumFeature) => boolean;
  activate: (key: string, email: string) => Promise<LicenseRecord>;
  deactivate: () => Promise<void>;
  refresh: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | undefined>(undefined);

interface LicenseProviderProps {
  children: ReactNode;
  /** Called when the user has no valid license in enforced mode. */
  onLicenseInvalid?: () => void;
}

export function LicenseProvider({ children, onLicenseInvalid }: LicenseProviderProps) {
  const [license, setLicense] = useState<LicenseRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mode = getPaywallMode();

  // Initial load + touch validation on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadLicense();
        if (cancelled) return;
        setLicense(loaded);
        // Bump lastValidated so offline grace resets on each app open.
        if (loaded) {
          const refreshed = await touchValidation();
          if (!cancelled && refreshed) setLicense(refreshed);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tier = useMemo(() => effectiveTier(license), [license]);
  // In evaluation mode `isValid` is always true so LicenseGate never blocks.
  const isValid = useMemo(() => {
    if (isEvaluationMode()) return true;
    return license !== null && tier !== "free";
  }, [license, tier]);

  // Fire onLicenseInvalid callback when we settle into an invalid state.
  useEffect(() => {
    if (!isLoading && !isValid && mode === "enforced") {
      onLicenseInvalid?.();
    }
  }, [isLoading, isValid, mode, onLicenseInvalid]);

  const activate = useCallback(async (key: string, email: string) => {
    const record = await activateLicense(key, email);
    setLicense(record);
    return record;
  }, []);

  const deactivate = useCallback(async () => {
    await deactivateLicense();
    setLicense(null);
  }, []);

  const refresh = useCallback(async () => {
    const refreshed = await touchValidation();
    setLicense(refreshed);
  }, []);

  const has = useCallback(
    (feature: PremiumFeature) => {
      if (isEvaluationMode()) return true;
      return hasFeature(tier, feature);
    },
    [tier],
  );

  const value: LicenseContextValue = {
    isLoading,
    isValid,
    license,
    tier,
    mode,
    daysRemaining: daysRemaining(license),
    has,
    activate,
    deactivate,
    refresh,
  };

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) {
    throw new Error("useLicense must be used within a LicenseProvider");
  }
  return ctx;
}

// ─── LicenseGate ─────────────────────────────────────────────────────────
// Full-app gate. Renders `invalidComponent` if the user has no valid
// license in enforced mode. In evaluation mode it always renders children.
interface LicenseGateProps {
  children: ReactNode;
  loadingComponent?: ReactNode;
  invalidComponent?: ReactNode;
}

export function LicenseGate({
  children,
  loadingComponent,
  invalidComponent,
}: LicenseGateProps) {
  const { isLoading, isValid } = useLicense();

  if (isLoading) {
    return loadingComponent !== undefined ? (
      <>{loadingComponent}</>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isValid && invalidComponent !== undefined) {
    return <>{invalidComponent}</>;
  }

  return <>{children}</>;
}

// ─── FeatureGate ─────────────────────────────────────────────────────────
// Wrap any premium UI in <FeatureGate feature="ai_search">. Renders
// children when the feature is available, otherwise renders `fallback`
// (or null). In evaluation mode every feature passes.
interface FeatureGateProps {
  feature: PremiumFeature;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { has } = useLicense();
  if (has(feature)) return <>{children}</>;
  return <>{fallback}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
