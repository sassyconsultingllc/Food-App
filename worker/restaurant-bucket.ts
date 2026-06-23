/**
 * Anonymous Restaurant Bucket IDs
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Turns a restaurant's identity (name + coordinates) into a stable, opaque
 * bucket ID used to key community notes + photos in D1/R2. Design properties:
 *
 *  - DETERMINISTIC: the same physical restaurant => the same ID for every user,
 *    regardless of which provider (Google/FSQ/OSM) supplied the record, so
 *    community content aggregates correctly. Inputs are limited to fields that
 *    are stable across providers (lat/lng and name) -- NOT free-text addresses,
 *    which every provider formats differently and would fragment buckets.
 *  - ONE-WAY + KEYED: HMAC-SHA256 under a Worker-only PEPPER secret. The stored
 *    ID embeds NO name/address/coords, and a leak of D1/R2 alone cannot be
 *    reversed without the pepper (which never leaves the Worker).
 *  - VERSIONED: the scheme version is part of the hash input AND prefixes the
 *    ID, so the canonicalization can be evolved (v2...) later without corrupting
 *    or colliding with existing buckets.
 *
 * THREAT MODEL -- be honest: determinism is a hard requirement for
 * per-restaurant aggregation, so anyone holding BOTH the pepper and a public
 * list of nearby restaurants can brute-force a given area. This protects
 * against a data-store leak (the realistic threat), NOT a full Worker
 * compromise. The pepper must live ONLY in
 * `wrangler secret put RESTAURANT_BUCKET_PEPPER` -- never in code, the
 * database, or the client bundle.
 *
 * INVARIANT: nothing in this file (or its callers) may log the plaintext
 * identity next to the bucket ID -- that would defeat the entire scheme.
 *
 * Runs on both the Workers runtime and Node 18+ (both expose Web Crypto as the
 * `crypto` global), so it is unit-testable under vitest without mocks.
 */

export const BUCKET_SCHEME_VERSION = "v1";

// ~150 m cells. Coarse enough to tolerate GPS / cross-provider coordinate
// jitter for a single venue, fine enough that two different same-name
// locations almost never share a cell. Changing this changes EVERY id, so it
// requires a BUCKET_SCHEME_VERSION bump + migration.
export const GEOHASH_PRECISION = 7;

const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Standard (Niemeyer) geohash encoder -- pure and deterministic.
 * Throws on out-of-range / non-finite coordinates so we never produce a
 * garbage bucket from bad data.
 */
export function geohashEncode(
  lat: number,
  lng: number,
  precision: number = GEOHASH_PRECISION
): string {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new Error("geohashEncode: lat/lng must be finite and in range");
  }

  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let hash = "";
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        idx = idx * 2 + 1;
        lngMin = mid;
      } else {
        idx = idx * 2;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        idx = idx * 2 + 1;
        latMin = mid;
      } else {
        idx = idx * 2;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += GEOHASH_BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }
  return hash;
}

/**
 * Normalize a restaurant name so trivial cross-provider differences (case,
 * accents, punctuation, spacing, &/and) converge to the same string.
 *
 * Kept deliberately LIGHT: because the geohash already separates locations, the
 * name only has to distinguish different restaurants in the SAME ~150 m cell.
 * Heavier brand / store-number stripping (e.g. "McDonald's #1234") is
 * intentionally deferred to a future scheme version -- over-normalizing risks
 * merging genuinely distinct venues, which is worse than minor fragmentation.
 */
export function normalizeRestaurantName(name: string): string {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // strip accents after decomposition: Cafe-acute -> cafe
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, ""); // keep letters/digits of any script, drop the rest
}

/**
 * The exact canonical string that gets hashed. Exposed for tests/debugging
 * ONLY -- never persist or log this alongside a bucket id.
 * Throws if the name normalizes to empty (a degenerate identity we refuse to
 * bucket, so two such venues in one cell can't collide).
 */
export function canonicalIdentity(name: string, lat: number, lng: number): string {
  const normName = normalizeRestaurantName(name);
  if (!normName) {
    throw new Error("canonicalIdentity: name normalizes to empty");
  }
  return `${BUCKET_SCHEME_VERSION}|${geohashEncode(lat, lng)}|${normName}`;
}

const B32_RFC4648 = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32 (lowercase, unpadded). */
function base32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32_RFC4648[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1; // keep only the leftover low bits (avoids 32-bit overflow)
  }
  if (bits > 0) {
    out += B32_RFC4648[(buffer << (5 - bits)) & 31];
  }
  return out;
}

/**
 * Compute the opaque, anonymous bucket ID for a restaurant.
 *
 * @param pepper Worker-only secret (env.RESTAURANT_BUCKET_PEPPER). NEVER ship
 *               to the client or store in the database.
 * @returns e.g. "v1_k7q3p2m..." -- version-prefixed so the scheme is
 *          identifiable for migrations without revealing anything about the
 *          restaurant.
 * @throws if the pepper is missing or the identity is invalid.
 */
export async function computeBucketId(
  pepper: string,
  name: string,
  lat: number,
  lng: number
): Promise<string> {
  if (!pepper) {
    throw new Error("computeBucketId: missing RESTAURANT_BUCKET_PEPPER secret");
  }
  const canonical = canonicalIdentity(name, lat, lng);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(canonical));
  // 26 base32 chars ~= 130 bits of the 256-bit HMAC -- collision-resistant well
  // past any realistic number of restaurants.
  return `${BUCKET_SCHEME_VERSION}_${base32(new Uint8Array(sig)).slice(0, 26)}`;
}

/**
 * Hash an opaque identifier (e.g. a client IP) under the pepper, for use as a
 * rate-limit key. This lets the limiter throttle per-IP WITHOUT ever storing or
 * logging the raw IP -- the KV key is an unguessable HMAC, and with a short TTL
 * it cannot be correlated back to a person after the window expires.
 * @throws if the salt is missing.
 */
export async function hashIdentifier(salt: string, value: string): Promise<string> {
  if (!salt) {
    throw new Error("hashIdentifier: missing salt secret");
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return base32(new Uint8Array(sig)).slice(0, 20);
}
