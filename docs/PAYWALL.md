# Paywall — Enforced Mode

Foodie Finder now ships with the paywall **enforced** (flipped 2026-07-02).
`EXPO_PUBLIC_PAYWALL_MODE=enforced` is set in `.env` and in every eas.json
build profile. Free-tier users hit gates on Pro features; the PaywallModal
upsells and routes to `/activate`.

## Wired gates

| Feature | Surface |
|---|---|
| unlimited_favorites | Add-favorite past 10 in Browse + Restaurant detail (removal always free) |
| ai_search | AI mode toggle on Browse |
| advanced_filters | Dietary chips on Browse; "Filters" sheet on the Spinner |
| similar_restaurants | "More Like This" on Restaurant detail (AI fetch skipped when unlicensed; Pro teaser shown) |
| menu_photo_uploads | Upload/camera buttons in MenuSection |
| spin_history_export, group_decision_mode, ad_free | Catalog-only — no UI exists yet |

Central plumbing: `components/paywall-host.tsx` (`PaywallProvider` +
`usePaywall().guard/guardLimit/showPaywall`), mounted in `app/_layout.tsx`.
Activation route: `app/activate.tsx`. Settings has a "Foodie Finder Pro"
section (status, activate, remove license, see perks).

## Test keys are dev/QA only

Test keys activate ONLY when `__DEV__` or `EXPO_PUBLIC_ALLOW_TEST_KEYS=1`
(set in the development and preview eas.json profiles, never production).
Production activation requires `EXPO_PUBLIC_LICENSE_SERVER_URL` — stand up
the license server before shipping an enforced build, or paying customers
have no way to activate.

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

## How to revert to evaluation mode

Set `EXPO_PUBLIC_PAYWALL_MODE=evaluation` (or unset it — evaluation is the
code default) in `.env` and the eas.json profiles, then ship a build.

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
