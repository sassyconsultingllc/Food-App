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
Production activation goes through the license server below.

## License server (worker/license.ts)

Lives on the main API worker — `EXPO_PUBLIC_LICENSE_SERVER_URL` points at
`https://foodie-finder.sassyconsultingllc.com` in every eas.json profile.
D1 tables (`licenses`, `license_devices`, `license_events`) are created
lazily on first request, same pattern as the restaurant cache.

| Endpoint | Auth | Purpose |
|---|---|---|
| POST `/api/license/activate` | key+email match | Client contract: `{key,email,deviceId}` → `{tier,expiresAt}`. 3-device cap, hashed device ids. |
| POST `/api/license/deactivate` | key | Frees a device slot. |
| POST `/api/license/checkout` | — | `{tier,email}` → Stripe checkout URL (503 until Stripe secrets set). |
| GET `/api/license/claim?session_id=cs_...` | session id (unguessable) | Success page fetches the minted key — no email service needed. 202 while webhook lags. |
| POST `/api/license/webhook/stripe` | HMAC (timing-safe) | Mints key on `checkout.session.completed` (idempotent per session); subscription lifecycle → suspend/expire. |
| POST `/api/license/admin/mint` / `admin/revoke` | Bearer `LICENSE_ADMIN_SECRET` | Manual sales, comps, revocation. 404 when secret unset. |

All license routes (except the webhook, which authenticates via HMAC) are
rate-limited 10/min/IP, fail-closed. Unknown key and wrong email return
the identical error — no enumeration oracle. Prices are wrangler vars
(`PRICE_PRO_YEARLY_CENTS=999`, `PRICE_LIFETIME_CENTS=2999`).

### End-user anonymity (enforced at rest)

Our D1 database stores **no direct PII**:

- **Emails are hashed at rest** — `hmac1:<HMAC-SHA256(pepper, email)>` when
  `LICENSE_EMAIL_PEPPER` is set, `sha256:<hash>` fallback otherwise. The
  scheme prefix is stored per row, so rows minted before the pepper existed
  keep validating after it's introduced. Activation compares hashes; the
  claim endpoint never returns an email.
- **Device ids** are client-generated random tokens (`dev_<ts>_<rand>` from
  lib/license.ts — never a hardware id), stored SHA-256 hashed.
- **No stripe_customer_id** — the only Stripe references kept are the
  subscription id (renewal lifecycle) and checkout session id (key claim).
  Payment PII lives entirely at Stripe, which is unavoidable for card
  payments; a buyer who wants full anonymity can use an alias email there.
- **IPs are never persisted** — the rate limiter stores pepper-salted hashes
  with a ~2-minute TTL (existing worker pattern).
- Nothing in the license code console.logs an email, device id, or IP, so
  Workers observability captures none either.
- **Support without PII**: `POST /api/license/admin/lookup {email}` hashes
  the asker-supplied address server-side and matches at-rest hashes.

Community content was already anonymous (HMAC bucket ids — see
worker/restaurant-bucket.ts). Net: the only party holding customer PII is
Stripe, and only for Stripe purchases.

### Go-live checklist (in order)

1. `npx wrangler deploy --env production`
2. `npx wrangler secret put LICENSE_ADMIN_SECRET --env production`
   and `npx wrangler secret put LICENSE_EMAIL_PEPPER --env production`
   (long random string; set BEFORE the first real mint, never rotate —
   `hmac1:` email hashes stop verifying under a different pepper)
3. `npx wrangler secret put STRIPE_SECRET_KEY --env production`
4. In the Stripe dashboard: add webhook endpoint
   `https://foodie-finder.sassyconsultingllc.com/api/license/webhook/stripe`
   for `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed` — then
   `npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production`
5. Create the purchase-success page at
   `sassyconsultingllc.com/foodie-finder/purchase-success` that fetches
   `/api/license/claim?session_id=...` and displays the key (retry on 202).

Steps 1–2 are enough to sell manually (mint keys yourself, take payment
however). Steps 3–5 enable self-serve Stripe checkout.

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
