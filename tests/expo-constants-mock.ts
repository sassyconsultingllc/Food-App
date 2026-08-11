// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// Stand-in for expo-constants under Vitest. The real module reaches through
// expo-modules-core for the native `expo` global, which doesn't exist off-device.
// Values mirror a production Android build so currentBuildId() is stable.
const Constants = {
  nativeAppVersion: "1.0.4" as string | null,
  nativeBuildVersion: "24" as string | null,
  expoConfig: {
    version: "1.0.4",
    extra: {
      privacyPolicyUrl: "https://sassyconsultingllc.com/privacy/foodie-finder/",
      termsOfServiceUrl: "https://sassyconsultingllc.com/privacy/foodie-finder/terms",
    },
  } as Record<string, unknown> | null,
};

export default Constants;
