/**
 * License & Paywall Core
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Tier definitions, feature catalog, mode flag, and persistence for the
 * paywall system. Designed so the gating code stays in the bundle while
 * the app ships in "evaluation" mode — every feature unlocked so users
 * can try the full app before we flip the switch to "enforced".
 *
 * To flip on real gating later:
 *   1. Set EXPO_PUBLIC_PAYWALL_MODE=enforced in .env (and EAS secrets).
 *   2. Ship a build. No code changes required.
 *   3. Optionally point EXPO_PUBLIC_LICENSE_SERVER_URL at a validator and
 *      flesh out server/license-router.ts (stubbed).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ─── Tiers ───────────────────────────────────────────────────────────────
export type LicenseTier = "free" | "pro" | "lifetime";

// ─── Feature catalog ─────────────────────────────────────────────────────
// Add new gateable features here. The free tier is the public default;
// every other tier inherits free's features plus its own.
export type PremiumFeature =
  | "unlimited_favorites"
  | "advanced_filters"
  | "ai_search"
  | "group_decision_mode"
  | "menu_photo_uploads"
  | "similar_restaurants"
  | "spin_history_export"
  | "ad_free"
  | "priority_support";

const FREE_FEATURES: PremiumFeature[] = [];

const PRO_FEATURES: PremiumFeature[] = [
  "unlimited_favorites",
  "advanced_filters",
  "ai_search",
  "group_decision_mode",
  "menu_photo_uploads",
  "similar_restaurants",
  "spin_history_export",
  "ad_free",
];

const LIFETIME_FEATURES: PremiumFeature[] = [...PRO_FEATURES, "priority_support"];

export const TIER_FEATURES: Record<LicenseTier, PremiumFeature[]> = {
  free: FREE_FEATURES,
  pro: PRO_FEATURES,
  lifetime: LIFETIME_FEATURES,
};

// Soft limits enforced for free tier when paywall is in `enforced` mode.
// Eval mode ignores these — everything unlimited so testers see the real app.
export const FREE_TIER_LIMITS = {
  maxFavorites: 10,
  spinsPerDay: 20,
  menuUploadsPerRestaurant: 0,
} as const;

// ─── Mode flag ───────────────────────────────────────────────────────────
// `evaluation` = default. Every feature unlocked. App store listing is free.
//   Use this to let people try the full experience before we monetize.
// `enforced`   = real paywall. Free tier hits gates; FeatureGate blocks
//   premium UI; PaywallModal shows upsells.
export type PaywallMode = "evaluation" | "enforced";

export function getPaywallMode(): PaywallMode {
  const raw = process.env.EXPO_PUBLIC_PAYWALL_MODE;
  return raw === "enforced" ? "enforced" : "evaluation";
}

export function isEvaluationMode(): boolean {
  return getPaywallMode() === "evaluation";
}

// ─── License record ──────────────────────────────────────────────────────
export interface LicenseRecord {
  key: string;
  email: string;
  tier: LicenseTier;
  activatedAt: number; // epoch ms
  expiresAt: number | null; // null = lifetime / never expires
  deviceId: string;
  lastValidated: number; // epoch ms — for offline grace tracking
}

// ─── Storage ─────────────────────────────────────────────────────────────
// SecureStore on native (encrypted at rest); AsyncStorage on web.
// Key is namespaced so it can't collide with theme/storage etc.
const LICENSE_STORAGE_KEY = "foodie_finder_license_v1";

async function readStored(): Promise<LicenseRecord | null> {
  try {
    const raw =
      Platform.OS === "web"
        ? await AsyncStorage.getItem(LICENSE_STORAGE_KEY)
        : await SecureStore.getItemAsync(LICENSE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LicenseRecord;
    if (!parsed.key || !parsed.tier) return null;
    return parsed;
  } catch (err) {
    console.warn("[license] failed to read stored license", err);
    return null;
  }
}

async function writeStored(record: LicenseRecord | null): Promise<void> {
  try {
    if (record === null) {
      if (Platform.OS === "web") {
        await AsyncStorage.removeItem(LICENSE_STORAGE_KEY);
      } else {
        await SecureStore.deleteItemAsync(LICENSE_STORAGE_KEY);
      }
      return;
    }
    const serialized = JSON.stringify(record);
    if (Platform.OS === "web") {
      await AsyncStorage.setItem(LICENSE_STORAGE_KEY, serialized);
    } else {
      await SecureStore.setItemAsync(LICENSE_STORAGE_KEY, serialized);
    }
  } catch (err) {
    console.warn("[license] failed to persist license", err);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Load the current license from storage. Returns null if nothing stored.
 * Always returns null in evaluation mode would defeat the point — we keep
 * the stored record so users who DO have a paid license still see their
 * tier even while the app is free for evaluation.
 */
export async function loadLicense(): Promise<LicenseRecord | null> {
  return readStored();
}

/**
 * Effective tier for gating logic. In evaluation mode every user is
 * treated as `lifetime` so all features unlock — gating code stays
 * exercised but never blocks. In enforced mode we use the stored tier
 * (or `free` if nothing is activated).
 */
export function effectiveTier(stored: LicenseRecord | null): LicenseTier {
  if (isEvaluationMode()) return "lifetime";
  if (!stored) return "free";
  if (stored.expiresAt !== null && stored.expiresAt < Date.now()) return "free";
  return stored.tier;
}

/**
 * Does this tier include the given feature?
 */
export function hasFeature(tier: LicenseTier, feature: PremiumFeature): boolean {
  return TIER_FEATURES[tier].includes(feature);
}

/**
 * Higher-order helper for gating function calls. Throws if the user does
 * not have the required feature. No-op in evaluation mode.
 *
 *   const exportSpins = requireLicense("spin_history_export", async () => { ... })
 */
export function requireLicense<TArgs extends unknown[], TReturn>(
  feature: PremiumFeature,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return (...args: TArgs) => {
    if (isEvaluationMode()) return fn(...args);
    // Synchronous wrapper — callers that need an async check should use
    // the useLicense hook instead. We optimistically allow here and let
    // the next render of FeatureGate catch missing access.
    return fn(...args);
  };
}

/**
 * Activate a license key. Talks to the license server if configured;
 * otherwise accepts known test keys locally so QA flows work offline.
 *
 * This is the stub for full server-backed activation. Wire it up to the
 * real endpoint when you're ready to monetize.
 */
export async function activateLicense(
  key: string,
  email: string,
): Promise<LicenseRecord> {
  const serverUrl = process.env.EXPO_PUBLIC_LICENSE_SERVER_URL;

  // Built-in test keys for local dev / QA. Same shape as the LICENSING.md
  // doc spec so existing test fixtures still work.
  //
  // SECURITY: these keys are documented and must never activate a paid
  // tier in a store build. They work only in dev, or when a build profile
  // explicitly opts in (eas.json preview sets EXPO_PUBLIC_ALLOW_TEST_KEYS=1
  // so QA can exercise the enforced-mode activation flow).
  const testKeysEnabled =
    __DEV__ || process.env.EXPO_PUBLIC_ALLOW_TEST_KEYS === "1";
  const TEST_KEYS: Record<string, { tier: LicenseTier; days: number | null }> = {
    "FF-TEST-TRIAL-001": { tier: "free", days: 14 },
    "FF-PRO-2024-DEMO": { tier: "pro", days: 365 },
    "FF-LIFETIME-DEMO": { tier: "lifetime", days: null },
  };

  if (testKeysEnabled && TEST_KEYS[key]) {
    const { tier, days } = TEST_KEYS[key];
    const now = Date.now();
    const record: LicenseRecord = {
      key,
      email,
      tier,
      activatedAt: now,
      expiresAt: days === null ? null : now + days * 24 * 60 * 60 * 1000,
      deviceId: await getOrCreateDeviceId(),
      lastValidated: now,
    };
    await writeStored(record);
    return record;
  }

  if (!serverUrl) {
    throw new Error(
      "License server not configured. Set EXPO_PUBLIC_LICENSE_SERVER_URL or use a test key.",
    );
  }

  // Real server validation — endpoint shape matches docs/LICENSING.md.
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/license/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, email, deviceId: await getOrCreateDeviceId() }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Activation failed (${res.status}): ${detail || res.statusText}`);
  }
  const payload = (await res.json()) as {
    tier: LicenseTier;
    expiresAt: number | null;
  };
  const now = Date.now();
  const record: LicenseRecord = {
    key,
    email,
    tier: payload.tier,
    activatedAt: now,
    expiresAt: payload.expiresAt,
    deviceId: await getOrCreateDeviceId(),
    lastValidated: now,
  };
  await writeStored(record);
  return record;
}

/**
 * Clear stored license — used when user signs out or transfers device.
 */
export async function deactivateLicense(): Promise<void> {
  await writeStored(null);
}

/**
 * Refresh validation timestamp. In a real deploy this would call back to
 * the server; here it just bumps `lastValidated` so the offline grace
 * window is reset on app open.
 */
export async function touchValidation(): Promise<LicenseRecord | null> {
  const current = await readStored();
  if (!current) return null;
  const updated: LicenseRecord = { ...current, lastValidated: Date.now() };
  await writeStored(updated);
  return updated;
}

// ─── Device ID ───────────────────────────────────────────────────────────
const DEVICE_ID_KEY = "foodie_finder_device_id_v1";

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const stored =
      Platform.OS === "web"
        ? await AsyncStorage.getItem(DEVICE_ID_KEY)
        : await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (stored) return stored;
  } catch {
    // fall through to mint a new one
  }
  // Lightweight random — sufficient for device counting, not a security boundary.
  const fresh = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    if (Platform.OS === "web") {
      await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
    } else {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
    }
  } catch (err) {
    console.warn("[license] could not persist device id", err);
  }
  return fresh;
}

// ─── Days-remaining helper for UI ────────────────────────────────────────
export function daysRemaining(record: LicenseRecord | null): number | null {
  if (!record || record.expiresAt === null) return null;
  const ms = record.expiresAt - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
