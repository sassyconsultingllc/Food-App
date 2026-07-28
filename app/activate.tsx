// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-FFKPIMV6GTDV
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
