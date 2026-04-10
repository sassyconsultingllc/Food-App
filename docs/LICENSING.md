# 🔐 License & Code Protection System

This document covers the licensing, obfuscation, and code protection systems implemented for Foodie Finder.

## Overview

The protection system consists of three layers:

1. **License Validation** - Runtime license checking with server verification
2. **Code Obfuscation** - JavaScript obfuscation to protect intellectual property
3. **License Server API** - Backend for license management, activation, and validation

---

## 1. License Validation (Client-Side)

### Files
- `lib/license.ts` - Core validation logic
- `hooks/use-license.tsx` - React hook and context provider
- `components/license-activation.tsx` - UI components

### Usage

#### Wrap your app with LicenseProvider

```tsx
// app/_layout.tsx
import { LicenseProvider, LicenseGate } from '@/hooks/use-license';
import { LicenseActivationScreen } from '@/components/license-activation';

export default function RootLayout() {
  return (
    <LicenseProvider
      onLicenseInvalid={() => console.log('License invalid')}
      requireLicense={true}
    >
      <LicenseGate
        loadingComponent={<LoadingScreen />}
        invalidComponent={<LicenseActivationScreen />}
      >
        <Stack>
          {/* Your app screens */}
        </Stack>
      </LicenseGate>
    </LicenseProvider>
  );
}
```

#### Check license in components

```tsx
import { useLicense, FeatureGate } from '@/hooks/use-license';

function MyComponent() {
  const { isValid, license, daysRemaining } = useLicense();

  return (
    <View>
      <Text>License: {license?.tier}</Text>
      <Text>Days remaining: {daysRemaining}</Text>
      
      {/* Only show for pro users */}
      <FeatureGate feature="advanced_filters">
        <AdvancedFilters />
      </FeatureGate>
    </View>
  );
}
```

#### Protect functions

```tsx
import { requireLicense } from '@/lib/license';

const premiumFeature = requireLicense(async (data: string) => {
  // This will throw if no valid license
  return processData(data);
});
```

### Configuration

Set your license server URL:

```bash
# .env
EXPO_PUBLIC_LICENSE_SERVER_URL=https://license.yourdomain.com
```

---

## 2. Code Obfuscation

### Files
- `obfuscator.config.js` - Obfuscation profiles
- `scripts/build-protected.js` - Build script with obfuscation

### Profiles

| Profile | Use Case | Protection Level |
|---------|----------|------------------|
| `production` | Distribution builds | Maximum |
| `development` | Testing obfuscation | Light |
| `server` | Server-side code | Medium |

### Build Commands

```bash
# Production build with full obfuscation
pnpm build:protected

# Development build (lighter obfuscation)
pnpm build:protected:dev

# Custom profile
node scripts/build-protected.js --profile=server
```

### Output

Protected builds are output to `dist/protected/` with:
- Obfuscated JavaScript
- License bootstrap loader
- Production package.json
- Environment template

### Protection Features

**Production Profile includes:**
- Control flow flattening
- Dead code injection
- Debug protection
- String array encoding (base64 + RC4)
- Self-defending code
- Unicode escape sequences
- Object key transformation

---

## 3. License Server API

### Files
- `server/license-router.ts` - tRPC + Express routes

### Endpoints

#### tRPC Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `license.validate` | mutation | Validate existing license |
| `license.activate` | mutation | Activate on new device |
| `license.deactivate` | mutation | Remove device from license |
| `license.create` | mutation | Create new license (admin) |
| `license.revoke` | mutation | Revoke a license (admin) |
| `license.info` | query | Get license details (admin) |

#### REST Endpoints

```
POST /api/license/validate
POST /api/license/activate
```

### Test Licenses

Pre-seeded test licenses:

| Key | Tier | Devices | Duration |
|-----|------|---------|----------|
| `FF-TEST-TRIAL-001` | trial | 1 | 14 days |
| `FF-PRO-2024-DEMO` | professional | 5 | 365 days |

### Create New License

```bash
# Interactive mode
pnpm license:create -i

# Command line
pnpm license:create -e customer@example.com -t professional

# With custom duration
pnpm license:create -e customer@example.com -t standard -d 730
```

### Environment Variables

```bash
# Server
LICENSE_PRIVATE_KEY=your-rsa-private-key
LICENSE_ADMIN_SECRET=your-admin-secret

# Client
EXPO_PUBLIC_LICENSE_SERVER_URL=https://license.yourdomain.com
```

---

## License Tiers

| Tier | Features | Devices | Default Duration |
|------|----------|---------|------------------|
| trial | basic_search, favorites | 1 | 14 days |
| standard | + advanced_filters, notifications | 2 | 365 days |
| professional | All features (*) | 5 | 365 days |
| enterprise | All features (*) | Unlimited | 365 days |

---

## Security Considerations

### Production Checklist

- [ ] Generate unique RSA key pair for signing
- [ ] Store private key securely (env vars, secrets manager)
- [ ] Use HTTPS for all license server communication
- [ ] Set strong admin secret
- [ ] Enable domain locking in obfuscator config
- [ ] Store licenses in database (not in-memory)
- [ ] Implement rate limiting on validation endpoints
- [ ] Add monitoring for suspicious validation patterns

### Key Generation

```bash
# Generate RSA key pair
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Base64 encode for env vars
cat private.pem | base64 -w 0 > private.b64
cat public.pem | base64 -w 0 > public.b64
```

---

## Offline Support

The license system supports offline usage with a configurable grace period:

- Default: 7 days offline allowed
- Requires successful validation before going offline
- Automatic revalidation when connection restored
- Shows "Offline Mode" indicator in UI

---

## Troubleshooting

### "Device not activated"
User needs to activate with their license key and email first.

### "Device limit reached"
User has activated on maximum devices. They need to deactivate one first.

### "License expired"
Direct user to renewal page.

### Build fails with obfuscation
Check `reservedNames` in config - some React internals may need to be excluded.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│  License Server │
│                 │     │                 │
│  lib/license.ts │     │ license-router  │
│  use-license.tsx│     │                 │
└─────────────────┘     └─────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐     ┌─────────────────┐
│  SecureStore    │     │    Database     │
│  (local cache)  │     │  (licenses DB)  │
└─────────────────┘     └─────────────────┘
```
