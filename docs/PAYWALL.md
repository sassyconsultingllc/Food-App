# Paywall — Evaluation Mode

Foodie Finder ships with a full paywall infrastructure in the bundle, but
runs in **evaluation mode** by default. Every premium feature is
unlocked. The app store listing is free so users can try the full app
before we monetize.

## Files

| File | Role |
|---|---|
| [`lib/license.ts`](../lib/license.ts) | Tier definitions, feature catalog, mode flag, SecureStore persistence, activation |
| [`hooks/use-license.tsx`](../hooks/use-license.tsx) | `LicenseProvider`, `useLicense`, `FeatureGate`, `LicenseGate` |
| [`components/paywall-modal.tsx`](../components/paywall-modal.tsx) | Upsell sheet shown when a premium feature is tapped in enforced mode |
| [`components/license-activation.tsx`](../components/license-activation.tsx) | License-key entry screen (used by `LicenseGate` in enforced mode) |
| [`obfuscator.config.js`](../obfuscator.config.js) | JS obfuscator profiles (production / development / server) |
| [`scripts/build-protected.js`](../scripts/build-protected.js) | `pnpm build:protected` — server build with obfuscation + license bootstrap |

## How to gate a feature

```tsx
import { FeatureGate } from "@/hooks/use-license";

<FeatureGate
  feature="ai_search"
  fallback={<UpgradePrompt onPress={() => setPaywallOpen(true)} />}
>
  <AISearchBar />
</FeatureGate>
```

In **evaluation** mode this always renders `<AISearchBar />`. In
**enforced** mode it renders the fallback for free-tier users.

For imperative checks:

```tsx
const { has } = useLicense();
if (has("menu_photo_uploads")) {
  // ...
}
```

## How to flip on real gating later

1. In `.env` (or EAS secrets for builds):
   ```
   EXPO_PUBLIC_PAYWALL_MODE=enforced
   ```
2. Optionally point at a license server:
   ```
   EXPO_PUBLIC_LICENSE_SERVER_URL=https://license.sassyconsultingllc.com
   ```
3. Ship a build. No code changes required — the gating wrappers in the
   bundle activate.

## App store listing

Mode flips are independent of the store listing. To switch the listing
from paid → free for evaluation:

- **Google Play Console** → Monetization setup → Pricing → set "Free".
- **App Store Connect** → Pricing and Availability → Price → Free.

Once you're ready to monetize, switch to a paid tier (or keep free and
sell Pro via in-app purchase / external license keys).

## Tiers & features

Defined in `lib/license.ts`:

| Tier | Features |
|---|---|
| free | (none gated) |
| pro | unlimited_favorites, advanced_filters, ai_search, group_decision_mode, menu_photo_uploads, similar_restaurants, spin_history_export, ad_free |
| lifetime | pro + priority_support |

Add new features to the `PremiumFeature` union and the tier arrays.

## Test keys

Built-in for QA without a license server:

| Key | Tier | Duration |
|---|---|---|
| `FF-TEST-TRIAL-001` | free | 14 days |
| `FF-PRO-2024-DEMO` | pro | 365 days |
| `FF-LIFETIME-DEMO` | lifetime | never expires |

Enter these on the `LicenseActivationScreen` to test activation flows.
