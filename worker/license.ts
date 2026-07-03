/**
 * License Server — activation, Lemon Squeezy checkout, key minting, revocation.
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Backend for the enforced paywall (see docs/PAYWALL.md). The client
 * contract is fixed by lib/license.ts activateLicense():
 *
 *   POST /api/license/activate  { key, email, deviceId }
 *   -> 200 { tier: "pro" | "lifetime", expiresAt: epoch-ms | null }
 *   -> 4xx { error }   (client shows res.text() to the user)
 *
 * Purchase flow (no email provider needed), same shape as the Lemon
 * Squeezy integration on sassyconsultingllc-cloudflare (src/worker.js):
 *   1. POST /api/license/checkout { tier, email } -> we mint our own
 *      correlation ref (crypto.randomUUID()), create a Lemon Squeezy
 *      checkout via the JSON:API with that ref embedded in
 *      checkout_data.custom, and return the hosted checkout URL.
 *   2. Lemon Squeezy -> POST /api/license/webhook/lemonsqueezy on
 *      order_created (lifetime) / subscription_created (pro), signed via
 *      HMAC-SHA256 hex of the raw body in the `X-Signature` header. We
 *      verify, mint the key, and persist keyed by `ref` (payment_ref).
 *   3. The success page calls GET /api/license/claim?session_id=<ref>
 *      (a UUID only the buyer's browser has, acts as a bearer token) and
 *      shows the buyer their key.
 *
 * Manual sales / comps: POST /api/license/admin/mint with
 * `Authorization: Bearer <LICENSE_ADMIN_SECRET>`.
 *
 * Hardening:
 *   - activate/claim/checkout rate-limited per IP, fail-closed.
 *   - No key enumeration: bad key and bad email return the identical error.
 *   - Device ids stored as SHA-256 hashes only; device slots capped.
 *   - Webhook HMAC verified with a timing-safe compare.
 *   - Admin endpoint 404s unless LICENSE_ADMIN_SECRET is configured.
 *
 * Anonymity: this database stores NO direct PII.
 *   - Emails are hashed at rest (HMAC-SHA256 with LICENSE_EMAIL_PEPPER when
 *     set, plain SHA-256 otherwise). Each hash is prefixed with its scheme
 *     ("hmac1:" / "sha256:") so rows minted before the pepper existed keep
 *     validating after it's set — but set the pepper BEFORE going live so
 *     a leaked database can't be dictionary-attacked.
 *   - Device ids are client-generated random tokens, stored SHA-256 hashed.
 *   - No Lemon Squeezy customer id is stored; the only references kept are
 *     our own correlation ref (payment_ref, for key claim) and the
 *     subscription id (ls_subscription_id, required for renewal lifecycle
 *     webhooks). Payment PII (card, billing address) lives at Lemon Squeezy.
 *   - IPs are never persisted; the rate limiter stores salted hashes with a
 *     ~2-minute TTL. Nothing here console.logs an email or device id.
 *   - Support lookups still work: POST /api/license/admin/lookup hashes the
 *     asker-supplied email server-side and matches against stored hashes.
 */

import type { Hono } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "./context";
import { checkRateLimit, getClientIP } from "./rate-limit";

// ─── Tiers & pricing ─────────────────────────────────────────────────────
// Must stay in sync with lib/license.ts LicenseTier. "free" is never
// minted — it's the absence of a license.
export type PaidTier = "pro" | "lifetime";

const TIER_DAYS: Record<PaidTier, number | null> = {
  pro: 366, // yearly subscription; webhook extends on renewal
  lifetime: null,
};

const MAX_DEVICES_DEFAULT = 3;

// Lemon Squeezy checkouts reference a pre-created variant; price is
// whatever that variant is priced at in the LS dashboard, not something
// this worker sets per-request (unlike Stripe's dynamic price_data).
const LS_API = "https://api.lemonsqueezy.com/v1";

function lsHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

// pro = LS_VARIANT_PRO (annual subscription), lifetime = LS_VARIANT_LIFETIME
// (one-time order). Foodie Finder sells one billing period per tier, so —
// unlike sassyconsultingllc-cloudflare's resolveVariantId — no monthly/
// annual suffix resolution is needed.
function variantIdFor(env: Env, tier: PaidTier): string | undefined {
  return tier === "pro" ? env.LS_VARIANT_PRO : env.LS_VARIANT_LIFETIME;
}

// ─── Schema (lazy init, same pattern as cache.ts) ────────────────────────
let licenseTablesInitialized = false;

export async function initLicenseTables(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT NOT NULL UNIQUE,
        email_hash TEXT NOT NULL,
        tier TEXT NOT NULL CHECK (tier IN ('pro','lifetime')),
        status TEXT NOT NULL DEFAULT 'active',
        billing_type TEXT,
        ls_subscription_id TEXT,
        payment_ref TEXT,
        expires_at INTEGER,
        max_devices INTEGER NOT NULL DEFAULT ${MAX_DEVICES_DEFAULT},
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_licenses_email_hash ON licenses(email_hash)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_licenses_sub ON licenses(ls_subscription_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_licenses_ref ON licenses(payment_ref)`),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS license_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_id INTEGER NOT NULL,
        device_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        UNIQUE (license_id, device_hash)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS license_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_id INTEGER,
        event TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL
      )
    `),
  ]);
}

/**
 * One-time in-place migration covering two prior short-lived schemas that
 * never shipped to production:
 *   1. Plaintext emails (column `email`) + stripe_customer_id.
 *   2. Stripe-specific column names (stripe_subscription_id,
 *      stripe_session_id) from before the Lemon Squeezy port.
 * Runs lazily like table creation itself — required because the shared D1
 * already has tables from an earlier schema, and deploys must never race a
 * manual migration step. Any row that somehow carries a plaintext email (no
 * scheme prefix) is hashed in place with the fallback scheme.
 */
async function migrateLicenseSchemaIfNeeded(db: D1Database, pepper?: string): Promise<void> {
  const columns = await db.prepare(`PRAGMA table_info(licenses)`).all<{ name: string }>();
  const names = new Set((columns.results ?? []).map((c) => c.name));
  if (names.has("email")) {
    await db.prepare(`ALTER TABLE licenses RENAME COLUMN email TO email_hash`).run();
  }
  if (names.has("stripe_customer_id")) {
    await db.prepare(`ALTER TABLE licenses DROP COLUMN stripe_customer_id`).run();
  }
  if (names.has("stripe_subscription_id")) {
    await db.prepare(`ALTER TABLE licenses RENAME COLUMN stripe_subscription_id TO ls_subscription_id`).run();
  }
  if (names.has("stripe_session_id")) {
    await db.prepare(`ALTER TABLE licenses RENAME COLUMN stripe_session_id TO payment_ref`).run();
    await db.prepare(`DROP INDEX IF EXISTS idx_licenses_session`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_licenses_ref ON licenses(payment_ref)`).run();
  }
  if (names.has("email")) {
    await db.prepare(`DROP INDEX IF EXISTS idx_licenses_email`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_licenses_email_hash ON licenses(email_hash)`).run();
    // Hash any plaintext leftovers (defense in depth — the old schema never
    // shipped to production, so this loop should see zero rows).
    const plaintext = await db
      .prepare(
        `SELECT id, email_hash FROM licenses
         WHERE email_hash NOT LIKE 'hmac1:%' AND email_hash NOT LIKE 'sha256:%'`
      )
      .all<{ id: number; email_hash: string }>();
    for (const row of plaintext.results ?? []) {
      await db
        .prepare(`UPDATE licenses SET email_hash = ? WHERE id = ?`)
        .bind(await hashEmail(pepper, row.email_hash), row.id)
        .run();
    }
  }
}

async function ensureLicenseTables(db: D1Database, pepper?: string): Promise<void> {
  if (licenseTablesInitialized) return;
  // Migration MUST run before init: on a database that still has the old
  // plaintext-email table, init's CREATE INDEX ...(email_hash) would fail
  // (CREATE TABLE IF NOT EXISTS no-ops, so the column is still `email`).
  // On a fresh database the PRAGMA sees no table and migration no-ops.
  await migrateLicenseSchemaIfNeeded(db, pepper);
  await initLicenseTables(db);
  licenseTablesInitialized = true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Crypto-secure license key: FF-XXXXX-XXXXX-XXXXX-XXXXX from an unambiguous
 * 32-char alphabet (no 0/O/1/I). 20 chars ≈ 100 bits of entropy.
 */
export function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let segment = "";
    for (let i = 0; i < 5; i++) {
      segment += chars[bytes[s * 5 + i] % chars.length];
    }
    segments.push(segment);
  }
  return `FF-${segments.join("-")}`;
}

export function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase();
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256Hex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash an email for at-rest storage. Self-describing scheme prefix so the
 * pepper can be introduced (or a scheme upgraded) without breaking rows
 * minted earlier — verification dispatches on the stored prefix.
 */
export async function hashEmail(pepper: string | undefined, email: string): Promise<string> {
  const normalized = normalizeEmail(email);
  if (pepper) return `hmac1:${await hmacSha256Hex(pepper, normalized)}`;
  return `sha256:${await sha256Hex(normalized)}`;
}

export async function emailMatchesHash(
  pepper: string | undefined,
  email: string,
  stored: string
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (stored.startsWith("hmac1:")) {
    // Pepper removed/rotated -> hmac1 rows can no longer verify. Fail
    // closed rather than silently downgrading.
    if (!pepper) return false;
    return timingSafeEqualHex(`hmac1:${await hmacSha256Hex(pepper, normalized)}`, stored);
  }
  if (stored.startsWith("sha256:")) {
    return timingSafeEqualHex(`sha256:${await sha256Hex(normalized)}`, stored);
  }
  return false;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function logEvent(
  db: D1Database,
  licenseId: number | null,
  event: string,
  detail: string
): Promise<void> {
  try {
    await db
      .prepare(`INSERT INTO license_events (license_id, event, detail, created_at) VALUES (?, ?, ?, ?)`)
      .bind(licenseId, event, detail, Date.now())
      .run();
  } catch (err) {
    console.warn("[license] event log failed", err);
  }
}

// Identical message for unknown key / wrong email — no enumeration oracle.
const INVALID_MSG = "Invalid license key or email.";

interface LicenseRow {
  id: number;
  license_key: string;
  email_hash: string;
  tier: PaidTier;
  status: string;
  expires_at: number | null;
  max_devices: number;
  ls_subscription_id: string | null;
}

// ─── Lemon Squeezy webhook signature ─────────────────────────────────────
// HMAC-SHA256 hex digest of the raw body, sent in the `X-Signature` header.
// No timestamp component (unlike Stripe) — LS webhooks aren't replay-guarded
// by the signature itself; idempotency is handled at mint time instead (see
// the payment_ref uniqueness check in the checkout.session-equivalent
// handler below). Same algorithm as sassyconsultingllc-cloudflare's
// verifyLsSignature (src/worker.js), reusing this file's HMAC helper.
export async function verifyLemonSqueezySignature(
  payload: string,
  signatureHex: string,
  secret: string
): Promise<boolean> {
  if (!signatureHex || !secret) return false;
  const expected = await hmacSha256Hex(secret, payload);
  return timingSafeEqualHex(expected, signatureHex.toLowerCase());
}

// ─── Minting ─────────────────────────────────────────────────────────────
export async function mintLicense(
  db: D1Database,
  opts: {
    emailHash: string; // pre-hashed via hashEmail(); plaintext never reaches this layer
    tier: PaidTier;
    billingType: string;
    days?: number | null; // undefined = tier default
    maxDevices?: number;
    lsSubscriptionId?: string | null;
    paymentRef?: string | null;
  }
): Promise<{ key: string; expiresAt: number | null }> {
  const now = Date.now();
  const days = opts.days === undefined ? TIER_DAYS[opts.tier] : opts.days;
  const expiresAt = days === null ? null : now + days * 24 * 60 * 60 * 1000;

  // Retry on the (astronomically unlikely) key collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = generateLicenseKey();
    try {
      const result = await db
        .prepare(
          `INSERT INTO licenses
             (license_key, email_hash, tier, status, billing_type,
              ls_subscription_id, payment_ref, expires_at, max_devices,
              created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          key,
          opts.emailHash,
          opts.tier,
          opts.billingType,
          opts.lsSubscriptionId ?? null,
          opts.paymentRef ?? null,
          expiresAt,
          opts.maxDevices ?? MAX_DEVICES_DEFAULT,
          now,
          now
        )
        .run();
      await logEvent(db, result.meta.last_row_id as number, "minted", opts.billingType);
      return { key, expiresAt };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/UNIQUE/i.test(msg) || attempt === 2) throw err;
    }
  }
  throw new Error("key generation failed");
}

// ─── Routes ──────────────────────────────────────────────────────────────
export function registerLicenseRoutes(app: Hono<{ Bindings: Env }>): void {
  // Rate limit the whole license surface. Tight: these are low-frequency
  // human actions. Fail-closed like every other limiter in this worker.
  app.use("/api/license/*", async (c, next) => {
    // Lemon Squeezy's webhook servers must not be throttled with the same
    // budget as end users; the webhook authenticates via HMAC instead.
    if (c.req.path === "/api/license/webhook/lemonsqueezy") return next();
    const ip = getClientIP(c);
    const { allowed, remaining } = await checkRateLimit(
      c.env.RATE_LIMIT,
      `license:${ip}`,
      10,
      60,
      c.env.RESTAURANT_BUCKET_PEPPER
    );
    c.header("X-RateLimit-Remaining", String(remaining));
    if (!allowed) {
      return c.json({ error: "Too many attempts. Try again in a minute." }, 429);
    }
    await next();
  });

  // ── Activate ──────────────────────────────────────────────────────────
  app.post("/api/license/activate", async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: "License service unavailable." }, 503);
    await ensureLicenseTables(db, c.env.LICENSE_EMAIL_PEPPER);

    let body: { key?: string; email?: string; deviceId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request." }, 400);
    }
    if (!body.key || !body.email || !body.deviceId) {
      return c.json({ error: "Missing key, email, or deviceId." }, 400);
    }

    const key = normalizeKey(body.key);

    const license = (await db
      .prepare(`SELECT * FROM licenses WHERE license_key = ?`)
      .bind(key)
      .first()) as LicenseRow | null;

    // Same response for unknown key and email mismatch — see INVALID_MSG.
    // Emails are never stored in plaintext; compare against the at-rest hash.
    if (
      !license ||
      !(await emailMatchesHash(c.env.LICENSE_EMAIL_PEPPER, body.email, license.email_hash))
    ) {
      return c.json({ error: INVALID_MSG }, 404);
    }

    if (license.status === "revoked" || license.status === "suspended") {
      await logEvent(db, license.id, "activate_blocked", license.status);
      return c.json(
        { error: "This license is no longer active. Contact support@sassyconsultingllc.com." },
        403
      );
    }

    const now = Date.now();
    if (license.expires_at !== null && license.expires_at < now) {
      if (license.status !== "expired") {
        await db
          .prepare(`UPDATE licenses SET status = 'expired', updated_at = ? WHERE id = ?`)
          .bind(now, license.id)
          .run();
      }
      return c.json({ error: "This license has expired. Renew to keep Pro access." }, 403);
    }

    // Device slot accounting. Device ids are stored hashed only.
    const deviceHash = await sha256Hex(body.deviceId);
    const existing = await db
      .prepare(`SELECT id, is_active FROM license_devices WHERE license_id = ? AND device_hash = ?`)
      .bind(license.id, deviceHash)
      .first<{ id: number; is_active: number }>();

    if (existing) {
      await db
        .prepare(`UPDATE license_devices SET is_active = 1, last_seen = ? WHERE id = ?`)
        .bind(now, existing.id)
        .run();
    } else {
      const active = await db
        .prepare(`SELECT COUNT(*) AS n FROM license_devices WHERE license_id = ? AND is_active = 1`)
        .bind(license.id)
        .first<{ n: number }>();
      if ((active?.n ?? 0) >= license.max_devices) {
        await logEvent(db, license.id, "activate_blocked", "device_limit");
        return c.json(
          {
            error: `This license is already active on ${license.max_devices} devices. Remove it from another device first (Settings > Remove License).`,
          },
          403
        );
      }
      await db
        .prepare(
          `INSERT INTO license_devices (license_id, device_hash, is_active, first_seen, last_seen)
           VALUES (?, ?, 1, ?, ?)`
        )
        .bind(license.id, deviceHash, now, now)
        .run();
    }

    await logEvent(db, license.id, "activated", existing ? "existing_device" : "new_device");

    // Exact client contract — lib/license.ts activateLicense().
    return c.json({ tier: license.tier, expiresAt: license.expires_at });
  });

  // ── Deactivate (frees a device slot) ──────────────────────────────────
  app.post("/api/license/deactivate", async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: "License service unavailable." }, 503);
    await ensureLicenseTables(db, c.env.LICENSE_EMAIL_PEPPER);

    let body: { key?: string; deviceId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request." }, 400);
    }
    if (!body.key || !body.deviceId) {
      return c.json({ error: "Missing key or deviceId." }, 400);
    }

    const license = await db
      .prepare(`SELECT id FROM licenses WHERE license_key = ?`)
      .bind(normalizeKey(body.key))
      .first<{ id: number }>();
    // Deliberately vague on unknown keys.
    if (!license) return c.json({ ok: true });

    const deviceHash = await sha256Hex(body.deviceId);
    await db
      .prepare(
        `UPDATE license_devices SET is_active = 0, last_seen = ?
         WHERE license_id = ? AND device_hash = ? AND is_active = 1`
      )
      .bind(Date.now(), license.id, deviceHash)
      .run();
    await logEvent(db, license.id, "deactivated", "device");
    return c.json({ ok: true });
  });

  // ── Lemon Squeezy checkout ──────────────────────────────────────────────
  app.post("/api/license/checkout", async (c) => {
    const env = c.env;
    if (!env.LEMONSQUEEZY_API_KEY || !env.LEMONSQUEEZY_STORE_ID) {
      return c.json({ error: "Purchases are not available yet. Check back soon." }, 503);
    }

    let body: { tier?: string; email?: string; successUrl?: string; cancelUrl?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request." }, 400);
    }
    const tier = body.tier as PaidTier;
    if (tier !== "pro" && tier !== "lifetime") {
      return c.json({ error: "Invalid tier." }, 400);
    }
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return c.json({ error: "Valid email required — your license key is tied to it." }, 400);
    }

    const variantId = variantIdFor(env, tier);
    if (!variantId) {
      return c.json({ error: "This plan is not available yet. Check back soon." }, 503);
    }

    // Our own correlation ref (LS's checkout API has no server-side URL
    // templating like Stripe's {CHECKOUT_SESSION_ID}) — we generate it and
    // embed it in checkout_data.custom; LS echoes it back on every webhook.
    const ref = crypto.randomUUID();
    const successBase =
      body.successUrl || "https://sassyconsultingllc.com/foodie-finder/purchase-success";
    const successUrl = `${successBase}${successBase.includes("?") ? "&" : "?"}session_id=${ref}`;

    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: normalizeEmail(body.email),
            custom: { ref, tier, app: "foodie-finder" },
          },
          checkout_options: { embed: false, media: false, logo: true },
          product_options: {
            redirect_url: successUrl,
            receipt_button_text: "Get my license",
            receipt_link_url: successUrl,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: String(env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: "variants", id: String(variantId) } },
        },
      },
    };

    const res = await fetch(`${LS_API}/checkouts`, {
      method: "POST",
      headers: lsHeaders(env),
      body: JSON.stringify(payload),
    });
    const session = (await res.json()) as {
      data?: { attributes?: { url?: string } };
      errors?: Array<{ detail?: string; title?: string }>;
    };
    if (!res.ok || session.errors) {
      console.error("[license] checkout create failed", session.errors?.[0]?.detail);
      return c.json({ error: "Could not start checkout. Try again later." }, 502);
    }
    const checkoutUrl = session.data?.attributes?.url;
    if (!checkoutUrl) {
      return c.json({ error: "Could not start checkout. Try again later." }, 502);
    }
    return c.json({ checkoutUrl, sessionId: ref });
  });

  // ── Claim (success page fetches the freshly minted key) ───────────────
  // The ref is a UUID only the buyer's browser has, so it acts as a
  // single-purpose bearer token. No email service required to deliver keys.
  app.get("/api/license/claim", async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: "License service unavailable." }, 503);
    await ensureLicenseTables(db, c.env.LICENSE_EMAIL_PEPPER);

    const sessionId = c.req.query("session_id") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return c.json({ error: "Invalid session." }, 400);
    }

    const license = await db
      .prepare(`SELECT license_key, tier, expires_at FROM licenses WHERE payment_ref = ?`)
      .bind(sessionId)
      .first<{ license_key: string; tier: string; expires_at: number | null }>();

    if (!license) {
      // Webhook may lag checkout by a few seconds — tell the page to retry.
      return c.json({ pending: true }, 202);
    }
    // No email in the response — we don't have it (hashed at rest), and the
    // buyer already knows which address they used at checkout.
    return c.json({
      key: license.license_key,
      tier: license.tier,
      expiresAt: license.expires_at,
    });
  });

  // ── Lemon Squeezy webhook ───────────────────────────────────────────────
  // Subscribe this endpoint to: order_created, subscription_created,
  // subscription_updated, subscription_payment_failed (LS dashboard or
  // scripts/finish-lemonsqueezy.ps1-style setup in the sassy site repo).
  app.post("/api/license/webhook/lemonsqueezy", async (c) => {
    const env = c.env;
    const db = env.DB;
    if (!db || !env.LEMONSQUEEZY_WEBHOOK_SECRET) {
      return c.json({ error: "Not configured." }, 503);
    }
    await ensureLicenseTables(db, c.env.LICENSE_EMAIL_PEPPER);

    const signature = c.req.header("X-Signature");
    if (!signature) return c.json({ error: "No signature." }, 400);

    // Raw body FIRST — the signature covers the exact bytes LS sent, and
    // reading .text() before .json() means a bad signature never reaches JSON.parse.
    const payload = await c.req.text();
    const valid = await verifyLemonSqueezySignature(
      payload,
      signature,
      env.LEMONSQUEEZY_WEBHOOK_SECRET
    );
    if (!valid) return c.json({ error: "Invalid signature." }, 401);

    let event: {
      meta?: { event_name?: string; custom_data?: { ref?: string; tier?: string; app?: string } };
      data?: { id?: string; attributes?: Record<string, unknown> };
    };
    try {
      event = JSON.parse(payload);
    } catch {
      return c.json({ error: "Invalid JSON." }, 400);
    }

    const eventName = event.meta?.event_name || "";
    const custom = event.meta?.custom_data || {};
    const attrs = (event.data?.attributes || {}) as {
      user_email?: string;
      customer_email?: string;
      status?: string;
      renews_at?: string;
      ends_at?: string;
    };
    const lsId = event.data?.id || ""; // order id or subscription id, per event

    try {
      switch (eventName) {
        case "order_created":
        case "subscription_created": {
          if (custom.app !== "foodie-finder") break; // other product on the same LS store
          const ref = custom.ref;
          const email = attrs.user_email || attrs.customer_email;
          const tier = custom.tier as PaidTier | undefined;
          if (!ref || !email || (tier !== "pro" && tier !== "lifetime")) {
            console.error("[license] webhook: missing ref/email/tier", eventName, lsId);
            break;
          }
          // Idempotency: Lemon Squeezy retries on non-2xx — don't double-mint.
          const already = await db
            .prepare(`SELECT id FROM licenses WHERE payment_ref = ?`)
            .bind(ref)
            .first();
          if (already) break;

          // Hash immediately — the buyer's email exists only inside this
          // handler's scope; D1 sees the hash, logs see nothing.
          const { key } = await mintLicense(db, {
            emailHash: await hashEmail(env.LICENSE_EMAIL_PEPPER, email),
            tier,
            billingType: tier === "pro" ? "yearly" : "lifetime",
            lsSubscriptionId: eventName === "subscription_created" ? lsId : null,
            paymentRef: ref,
          });
          console.log(`[license] minted ${key.slice(0, 8)}… for ${eventName} ${ref}`);
          break;
        }
        // Lemon Squeezy fires subscription_updated on every status change
        // (renewal, cancellation, expiry, un-pause, …) — attrs.status is the
        // single source of truth, so one handler covers the full lifecycle
        // instead of separate cancelled/expired/resumed cases.
        case "subscription_updated": {
          const license = await db
            .prepare(`SELECT id FROM licenses WHERE ls_subscription_id = ?`)
            .bind(lsId)
            .first<{ id: number }>();
          if (!license) break;

          const lsStatus = attrs.status || "";
          let status = "active";
          if (lsStatus === "past_due" || lsStatus === "paused") status = "suspended";
          if (lsStatus === "unpaid" || lsStatus === "expired") status = "expired";
          // "cancelled" keeps access through the paid period — status stays
          // active and expires_at (from ends_at) enforces the cutoff.

          const expiresSource = attrs.ends_at || attrs.renews_at;
          const expiresAt = expiresSource ? Date.parse(expiresSource) : null;
          await db
            .prepare(`UPDATE licenses SET status = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
            .bind(status, expiresAt, Date.now(), license.id)
            .run();
          await logEvent(db, license.id, "subscription_updated", lsStatus);
          break;
        }
        // Defense in depth in case subscription_updated lags or is missed —
        // force-suspend on the explicit failure event.
        case "subscription_payment_failed": {
          await db
            .prepare(
              `UPDATE licenses SET status = 'suspended', updated_at = ? WHERE ls_subscription_id = ?`
            )
            .bind(Date.now(), lsId)
            .run();
          break;
        }
      }
      return c.json({ received: true });
    } catch (err) {
      console.error("[license] webhook handler error", err);
      // 500 so Lemon Squeezy retries.
      return c.json({ error: "Handler error." }, 500);
    }
  });

  // ── Admin: mint / revoke (Bearer LICENSE_ADMIN_SECRET) ────────────────
  const requireAdmin = (c: { env: Env; req: { header: (n: string) => string | undefined } }) => {
    const secret = c.env.LICENSE_ADMIN_SECRET;
    if (!secret) return false; // unset -> endpoints don't exist (404)
    const auth = c.req.header("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    return token.length === secret.length && timingSafeEqualHex(token, secret);
  };

  app.post("/api/license/admin/mint", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "Not found" }, 404);
    const db = c.env.DB;
    if (!db) return c.json({ error: "License service unavailable." }, 503);
    await ensureLicenseTables(db, c.env.LICENSE_EMAIL_PEPPER);

    let body: { email?: string; tier?: string; days?: number; maxDevices?: number };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request." }, 400);
    }
    const tier = body.tier as PaidTier;
    if (!body.email || (tier !== "pro" && tier !== "lifetime")) {
      return c.json({ error: "email and tier (pro|lifetime) required." }, 400);
    }
    const { key, expiresAt } = await mintLicense(db, {
      emailHash: await hashEmail(c.env.LICENSE_EMAIL_PEPPER, body.email),
      tier,
      billingType: "manual",
      days: body.days === undefined ? undefined : body.days,
      maxDevices: body.maxDevices,
    });
    // Echoing the email back is transient (admin already has it); it is
    // not persisted anywhere.
    return c.json({ key, email: normalizeEmail(body.email), tier, expiresAt });
  });

  // Support flow without stored PII: hash the asker-supplied email and
  // match against at-rest hashes. Only usable with the admin secret.
  app.post("/api/license/admin/lookup", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "Not found" }, 404);
    const db = c.env.DB;
    if (!db) return c.json({ error: "License service unavailable." }, 503);
    await ensureLicenseTables(db, c.env.LICENSE_EMAIL_PEPPER);

    let body: { email?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request." }, 400);
    }
    if (!body.email) return c.json({ error: "email required." }, 400);

    // A pre-pepper row hashes as sha256:, a post-pepper row as hmac1: —
    // match either so support lookups survive the pepper being introduced.
    const hashes = [`sha256:${await sha256Hex(normalizeEmail(body.email))}`];
    if (c.env.LICENSE_EMAIL_PEPPER) {
      hashes.push(await hashEmail(c.env.LICENSE_EMAIL_PEPPER, body.email));
    }
    const rows = await db
      .prepare(
        `SELECT l.license_key, l.tier, l.status, l.billing_type, l.expires_at, l.created_at,
                (SELECT COUNT(*) FROM license_devices d WHERE d.license_id = l.id AND d.is_active = 1) AS active_devices
         FROM licenses l WHERE l.email_hash IN (${hashes.map(() => "?").join(",")})`
      )
      .bind(...hashes)
      .all();
    return c.json({ licenses: rows.results });
  });

  app.post("/api/license/admin/revoke", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "Not found" }, 404);
    const db = c.env.DB;
    if (!db) return c.json({ error: "License service unavailable." }, 503);
    await ensureLicenseTables(db, c.env.LICENSE_EMAIL_PEPPER);

    let body: { key?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request." }, 400);
    }
    if (!body.key) return c.json({ error: "key required." }, 400);
    const result = await db
      .prepare(`UPDATE licenses SET status = 'revoked', updated_at = ? WHERE license_key = ?`)
      .bind(Date.now(), normalizeKey(body.key))
      .run();
    return c.json({ revoked: (result.meta.changes ?? 0) > 0 });
  });
}
