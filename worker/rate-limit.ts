/**
 * KV-based sliding-window rate limiter + client IP extraction.
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Extracted from worker/index.ts so route modules (license.ts) can share
 * it without a circular import.
 */

import type { KVNamespace } from "@cloudflare/workers-types";
import { hashIdentifier } from "./restaurant-bucket";

export async function checkRateLimit(
  kv: KVNamespace | undefined,
  key: string,
  maxRequests: number,
  windowSeconds: number,
  salt?: string
): Promise<{ allowed: boolean; remaining: number }> {
  // FAIL CLOSED when KV is missing. A missing binding means an unknown
  // environment state; we don't want to hand out unlimited requests.
  // Short-circuit to `allowed: false` and surface the error via 429.
  if (!kv) return { allowed: false, remaining: 0 };

  // Sliding window: store a list of request timestamps in a rolling
  // `windowSeconds`-wide window. Previously this was a fixed tumbling
  // window keyed on floor(now/windowSeconds), which let an attacker
  // burst 2*maxRequests in ~1 second at a window boundary.
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  // Salt-hash the key (which embeds the client IP) so the raw IP is never
  // written to KV. With the short TTL below the hash can't be correlated to a
  // person after the window. No salt configured -> fall back to the raw key
  // (rate-limiting still works; it just isn't IP-anonymized).
  const hashedKey = salt ? await hashIdentifier(salt, key) : key;
  const storageKey = `rl:${hashedKey}`;

  const raw = await kv.get(storageKey);
  let stamps: number[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) stamps = parsed.filter((n) => typeof n === "number");
    } catch {
      stamps = [];
    }
  }

  // Drop stamps older than the window
  stamps = stamps.filter((ts) => now - ts < windowMs);

  if (stamps.length >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  stamps.push(now);
  await kv.put(storageKey, JSON.stringify(stamps), {
    expirationTtl: Math.ceil(windowSeconds * 2),
  });
  return { allowed: true, remaining: maxRequests - stamps.length };
}

/**
 * Extract the client IP. ONLY trust `cf-connecting-ip` — it's set by the
 * Cloudflare edge and cannot be spoofed by the client when the request
 * actually transits CF. x-forwarded-for is user-supplied on the
 * workers.dev URL and must never be used for rate-limit keying.
 */
export function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") || "anon";
}
