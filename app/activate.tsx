/**
 * /activate — license key entry route.
 * Reached from the PaywallModal ("Activate License") and from Settings.
 */

import { useRouter } from "expo-router";

import { LicenseActivationScreen } from "@/components/license-activation";

export default function ActivateRoute() {
  const router = useRouter();
  return (
    <LicenseActivationScreen
      onContinueWithoutActivation={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)");
      }}
    />
  );
}
