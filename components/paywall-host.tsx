/**
 * Paywall Host
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Single mount point for the upsell flow. Wraps the app once (in
 * app/_layout.tsx, inside LicenseProvider) and exposes `usePaywall()` so
 * any screen can gate a premium action imperatively:
 *
 *   const { guard } = usePaywall();
 *   const onExport = () => {
 *     if (!guard("spin_history_export")) return; // paywall shown
 *     doExport();
 *   };
 *
 * `guard` returns true when the feature is licensed (always true in
 * evaluation mode). When it returns false it has already presented the
 * PaywallModal for that feature. "Activate License" inside the modal
 * routes to /activate.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

import { PaywallModal } from "./paywall-modal";
import { useLicense } from "@/hooks/use-license";
import type { PremiumFeature } from "@/lib/license";

interface PaywallContextValue {
  /** Present the upsell sheet, optionally headlined by a specific feature. */
  showPaywall: (feature?: PremiumFeature) => void;
  /** True if licensed for the feature; otherwise shows the paywall and returns false. */
  guard: (feature: PremiumFeature) => boolean;
  /**
   * For soft-capped features (e.g. favorites): passes while `withinLimit`
   * is true even without a license, so free users keep the base allowance.
   */
  guardLimit: (feature: PremiumFeature, withinLimit: boolean) => boolean;
}

const PaywallContext = createContext<PaywallContextValue | undefined>(undefined);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { has } = useLicense();
  const [visible, setVisible] = useState(false);
  const [feature, setFeature] = useState<PremiumFeature | undefined>(undefined);

  const showPaywall = useCallback((f?: PremiumFeature) => {
    setFeature(f);
    setVisible(true);
  }, []);

  const guard = useCallback(
    (f: PremiumFeature) => {
      if (has(f)) return true;
      setFeature(f);
      setVisible(true);
      return false;
    },
    [has],
  );

  const guardLimit = useCallback(
    (f: PremiumFeature, withinLimit: boolean) => {
      if (withinLimit || has(f)) return true;
      setFeature(f);
      setVisible(true);
      return false;
    },
    [has],
  );

  const handleRequestActivate = useCallback(() => {
    setVisible(false);
    router.push("/activate");
  }, [router]);

  const value = useMemo(
    () => ({ showPaywall, guard, guardLimit }),
    [showPaywall, guard, guardLimit],
  );

  // On web, react-native-web's Modal can fail to unmount after its exit
  // animation (the portal stays in the DOM and blocks the app). Unmount the
  // whole component on close there; native keeps the slide-out animation.
  const renderModal = Platform.OS !== "web" || visible;

  return (
    <PaywallContext.Provider value={value}>
      {children}
      {renderModal && (
        <PaywallModal
          visible={visible}
          feature={feature}
          onClose={() => setVisible(false)}
          onRequestActivate={handleRequestActivate}
        />
      )}
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (!ctx) {
    throw new Error("usePaywall must be used within a PaywallProvider");
  }
  return ctx;
}
