// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Client-side gating regression tests.
 *
 * Covers two defects that shipped silently:
 *   1. requireLicense() called through on BOTH branches — anything gated
 *      with it ran for free-tier users.
 *   2. The worker returned 403 for BOTH revoked and expired licenses, so an
 *      expired subscriber got the "contact support" copy instead of a
 *      renewal nudge. Expiry is 410 now; keep the two distinct.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  hasFeature,
  effectiveTier,
  requireLicense,
  setCachedTier,
  getCachedTier,
  LicenseRequiredError,
  FREE_TIER_LIMITS,
  type LicenseRecord,
} from "../lib/license";

// These tests exercise ENFORCED-mode behavior. lib/license.ts reads
// EXPO_PUBLIC_PAYWALL_MODE at call time, so set it before each test.
beforeEach(() => {
  process.env.EXPO_PUBLIC_PAYWALL_MODE = "enforced";
  setCachedTier("free");
});

describe("tier → feature mapping", () => {
  it("free unlocks nothing gated", () => {
    expect(hasFeature("free", "ai_search")).toBe(false);
    expect(hasFeature("free", "unlimited_favorites")).toBe(false);
    expect(hasFeature("free", "menu_photo_uploads")).toBe(false);
  });

  it("pro unlocks the paid set but not priority_support", () => {
    expect(hasFeature("pro", "ai_search")).toBe(true);
    expect(hasFeature("pro", "advanced_filters")).toBe(true);
    expect(hasFeature("pro", "priority_support")).toBe(false);
  });

  it("lifetime is a superset of pro", () => {
    expect(hasFeature("lifetime", "ai_search")).toBe(true);
    expect(hasFeature("lifetime", "priority_support")).toBe(true);
  });
});

describe("effectiveTier", () => {
  const base: LicenseRecord = {
    key: "FF-AAAAA-BBBBB-CCCCC-DDDDD",
    email: "a@b.com",
    tier: "pro",
    activatedAt: 0,
    expiresAt: null,
    deviceId: "dev_x",
    lastValidated: 0,
  };

  it("falls back to free with no stored license", () => {
    expect(effectiveTier(null)).toBe("free");
  });

  it("honors a non-expiring license", () => {
    expect(effectiveTier(base)).toBe("pro");
  });

  it("downgrades an expired license to free", () => {
    expect(effectiveTier({ ...base, expiresAt: Date.now() - 1000 })).toBe("free");
  });

  it("keeps a not-yet-expired license", () => {
    expect(effectiveTier({ ...base, expiresAt: Date.now() + 60_000 })).toBe("pro");
  });
});

describe("requireLicense actually enforces", () => {
  it("throws for a free-tier user instead of calling through", () => {
    const fn = requireLicense("spin_history_export", () => "ran");
    expect(() => fn()).toThrow(LicenseRequiredError);
  });

  it("calls through once the tier covers the feature", () => {
    setCachedTier("pro");
    const fn = requireLicense("spin_history_export", () => "ran");
    expect(fn()).toBe("ran");
  });

  it("still blocks a pro user from a lifetime-only feature", () => {
    setCachedTier("pro");
    const fn = requireLicense("priority_support", () => "ran");
    expect(() => fn()).toThrow(LicenseRequiredError);
  });

  it("fails closed before the provider has loaded a tier", () => {
    // cachedTier defaults to "free" — a race at startup must not grant access.
    expect(getCachedTier()).toBe("free");
    const fn = requireLicense("ai_search", () => "ran");
    expect(() => fn()).toThrow(LicenseRequiredError);
  });

  it("never blocks in evaluation mode", () => {
    process.env.EXPO_PUBLIC_PAYWALL_MODE = "evaluation";
    setCachedTier("free");
    const fn = requireLicense("ai_search", () => "ran");
    expect(fn()).toBe("ran");
  });

  it("passes arguments and preserves the return value", () => {
    setCachedTier("lifetime");
    const fn = requireLicense("ai_search", (a: number, b: number) => a + b);
    expect(fn(2, 3)).toBe(5);
  });
});

describe("FREE_TIER_LIMITS reflects what is actually enforced", () => {
  it("caps favorites at a finite number (guardLimit call sites depend on this)", () => {
    expect(Number.isFinite(FREE_TIER_LIMITS.maxFavorites)).toBe(true);
    expect(FREE_TIER_LIMITS.maxFavorites).toBeGreaterThan(0);
  });

  it("does not claim a spin cap that no call site enforces", () => {
    expect(FREE_TIER_LIMITS.spinsPerDay).toBe(Infinity);
  });
});
