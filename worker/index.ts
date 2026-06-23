/**
 * Cloudflare Worker Entry Point
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc-router";
import { scrapeRestaurants, getCoords } from "./scraper";
import { initCacheTables } from "./cache";
import { discoverMenu, cacheKeyForWebsite } from "./menu-discoverer";
// =============================================================================
// D1 Cache Table Initialization (fixes Mercury audit CRITICAL)
// =============================================================================
let cacheTablesInitialized = false;
async function ensureCacheTablesIfNeeded(db: any) {
  if (cacheTablesInitialized) return;
  await initCacheTables(db);
  cacheTablesInitialized = true;
}
import type { Env } from "./context";
import type { KVNamespace } from "@cloudflare/workers-types";
import { hashIdentifier, computeBucketId } from "./restaurant-bucket";
import { stripImageMetadata } from "./image-metadata";

const app = new Hono<{ Bindings: Env }>();

// =============================================================================
// Rate Limiting Middleware (KV-based sliding window)
// =============================================================================
async function checkRateLimit(
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
function getClientIP(c: any): string {
  return c.req.header("cf-connecting-ip") || "anon";
}

// Rate limit: tRPC — 60 req/min per IP
app.use("/api/trpc/*", async (c, next) => {
  const ip = getClientIP(c);
  const { allowed, remaining } = await checkRateLimit(c.env.RATE_LIMIT, `trpc:${ip}`, 60, 60, c.env.RESTAURANT_BUCKET_PEPPER);
  c.header("X-RateLimit-Remaining", String(remaining));
  if (!allowed) return c.json({ error: "Rate limit exceeded. Try again in a minute." }, 429);
  await next();
});

// Rate limit: uploads — 10 req/min per IP
app.use("/api/menu/*/upload", async (c, next) => {
  const ip = getClientIP(c);
  const { allowed, remaining } = await checkRateLimit(c.env.RATE_LIMIT, `upload:${ip}`, 10, 60, c.env.RESTAURANT_BUCKET_PEPPER);
  c.header("X-RateLimit-Remaining", String(remaining));
  if (!allowed) return c.json({ error: "Upload rate limit exceeded. Try again in a minute." }, 429);
  await next();
});

// CORS — restrict to known origins. Unknown origins get an empty string
// back, which browsers treat as a real mismatch instead of silently
// accepting the hardcoded production origin (the old behavior masked
// genuine origin errors).
const ALLOWED_ORIGINS = [
  "https://foodie-finder.sassyconsultingllc.com",
  "http://localhost:8081",  // Expo dev
  "http://localhost:19006", // Expo web dev
];
app.use("/*", cors({
  origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ""),
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Health check
app.get("/api/health", (c) => {
  return c.json({ ok: true, timestamp: Date.now(), runtime: "cloudflare-workers" });
});

/**
 * Debug endpoints — authenticated only. Require a bearer token that
 * matches the DEBUG_TOKEN secret via constant-time compare. Without the
 * secret set, every debug endpoint returns 404 as if it doesn't exist.
 * This protects against:
 *   - /api/debug/inspect leaking request headers
 *   - /api/debug/search draining paid Google Places budget
 *   - /api/debug/geocode amplifying Nominatim requests
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

app.use("/api/debug/*", async (c, next) => {
  const expected = (c.env as any).DEBUG_TOKEN as string | undefined;
  // When DEBUG_TOKEN isn't set, debug endpoints simply don't exist.
  if (!expected) return c.notFound();

  const auth = c.req.header("authorization") || "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!presented || !constantTimeEqual(presented, expected)) {
    return c.notFound();
  }
  await next();
});

// Debug inspect endpoint (safe: does NOT return secret values)
app.all('/api/debug/inspect', async (c) => {
  try {
    const method = c.req.method;
    const url = c.req.url;
    // Filter out the authorization header so the debug token doesn't leak
    // in the response if someone logs or screenshots it.
    // HonoRequest exposes a single-header getter via c.req.header(name); the
    // raw Web Request is the only place a full headers iterator exists.
    // Fall back to an empty record when the raw request isn't attached.
    const rawHeaders = c.req?.raw?.headers
      ? Object.fromEntries(c.req.raw.headers.entries())
      : {};
    const { authorization, ...headers } = rawHeaders;
    const requestUrl = c.req?.raw?.url ?? c.req.url ?? '';
    const queryParams = requestUrl ? Object.fromEntries(new URL(requestUrl).searchParams.entries()) : {};

    let bodyText = '';
    try {
      bodyText = await (c.req.text ? c.req.text() : (c.req.raw && c.req.raw.text ? c.req.raw.text() : ''));
    } catch (e) {
      bodyText = '';
    }

    let parsedBody: any = null;
    try {
      parsedBody = bodyText ? JSON.parse(bodyText) : null;
    } catch (e) {
      parsedBody = null;
    }

    const batchInfo = Array.isArray(parsedBody)
      ? { isBatch: true, length: parsedBody.length, firstPath: parsedBody[0]?.params?.path ?? null, hasInput: !!parsedBody[0]?.params?.input }
      : null;

    // Report which secrets/bindings are present without revealing values
    const secretsPresent = {
      GOOGLE_PLACES_API_KEY: !!c.env.GOOGLE_PLACES_API_KEY,
      FOURSQUARE_API_KEY: !!c.env.FOURSQUARE_API_KEY,
      HERE_API_KEY: !!c.env.HERE_API_KEY,
    };

    const bindingsPresent = {
      DB: !!c.env.DB,
      VECTORIZE: !!c.env.VECTORIZE,
      AI: !!c.env.AI,
    };

    return c.json({
      ok: true,
      method,
      url,
      headers,
      queryParams,
      bodyPreview: bodyText ? bodyText.slice(0, 2000) : null,
      batchInfo,
      secretsPresent,
      bindingsPresent,
    });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Geocode diagnostic endpoint: returns coords and raw nominatim results
app.get('/api/debug/geocode', async (c) => {
  try {
    const postalCode = c.req.query('postalCode') || c.req.query('zip') || '';
    const countryCode = c.req.query('countryCode') || undefined;

    if (!postalCode) return c.json({ ok: false, error: 'postalCode required' }, 400);

    // Get the canonical coords using the scraper helper
    const coords = await getCoords(postalCode as string, countryCode as string | undefined);

    if (coords.lat === 0 && coords.lng === 0) {
      return c.json({ ok: false, error: 'Geocoding failed', coords }, 400);
    }

    // Also fetch raw nominatim responses for both country-scoped and unrestricted
    const buildUrl = (cc?: string) => {
      const u = new URL('https://nominatim.openstreetmap.org/search');
      u.searchParams.set('postalcode', postalCode as string);
      u.searchParams.set('format', 'json');
      u.searchParams.set('limit', '3');
      u.searchParams.set('addressdetails', '1');
      if (cc) u.searchParams.set('countrycodes', cc.toLowerCase());
      return u.toString();
    };

    const countryScoped = countryCode ? await (await fetch(buildUrl(countryCode as string), { headers: { 'User-Agent': 'FoodieFinder/2.0 (Diagnostic)' } })).json() : null;
    const usScoped = await (await fetch(buildUrl('US'), { headers: { 'User-Agent': 'FoodieFinder/2.0 (Diagnostic)' } })).json();
    const unrestricted = await (await fetch(buildUrl(), { headers: { 'User-Agent': 'FoodieFinder/2.0 (Diagnostic)' } })).json();

    return c.json({ ok: true, postalCode, countryCode: countryCode || null, coords, countryScoped, usScoped, unrestricted });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Debug search endpoint: directly run scraper and return sample results (temporary)
app.get('/api/debug/search', async (c) => {
  try {
    const postalCode = c.req.query('postalCode') || c.req.query('zip') || '';
    const countryCode = c.req.query('countryCode') || undefined;
    const radius = parseFloat(c.req.query('radius') || '5');
    const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 50);

    if (!postalCode) return c.json({ ok: false, error: 'postalCode required' }, 400);

    const env = c.env as any;

    const results = await scrapeRestaurants({
      postalCode: postalCode as string,
      countryCode: countryCode as string | undefined,
      radius: isNaN(radius) ? 5 : radius,
      radiusUnit: 'miles',
      limit: Math.max(limit, 10),
      foursquareKey: env.FOURSQUARE_API_KEY || '',
      hereKey: env.HERE_API_KEY || '',
      googleKey: env.GOOGLE_PLACES_API_KEY || '',
    });

    // Return only first `limit` results and a small sample
    return c.json({ ok: true, count: results.length, sample: results.slice(0, limit) });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});


// =============================================================================
// Vision API Proxy
// =============================================================================
// Classifies photo URLs as "menu" / "food" via Google Cloud Vision OCR.
// The real API key is stored as a worker secret (GOOGLE_VISION_API_KEY)
// — it is NEVER sent to the client. Results are cached in the RATE_LIMIT
// KV namespace (TTL 30d) to reduce Vision API spend on repeated photos.
//
// Thresholds are duplicated from utils/photo-classifier.ts so this
// endpoint is the authoritative classifier — clients simply consume the
// "menu" / "food" labels.
//
// Bumped down 2026-05-10: the previous AND of (charCount≥250, wordCount≥40,
// lineCount≥8) rejected legitimate one-page menus, chalkboards, and
// phone shots of printed menus where OCR confidence is uneven. The new
// rule passes anything with enough TEXT OR enough structured LINES,
// which catches sparse menus while still rejecting food photos (which
// produce ~0 chars and 0 lines).
const VISION_MIN_CHARS = 150;
const VISION_MIN_WORDS = 25;
const VISION_MIN_LINES = 6;
const VISION_CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

app.post("/api/vision/classify", async (c) => {
  const env = c.env as any;
  const visionKey = env.GOOGLE_VISION_API_KEY as string | undefined;
  if (!visionKey) {
    return c.json({ error: "Vision API not configured" }, 503);
  }

  // Rate-limit per client IP so a single caller can't drain the Vision budget.
  // Uses the same sliding-window limiter as /api/menu/*/upload (fails closed
  // when the KV binding is missing).
  const ip = getClientIP(c);
  const rl = await checkRateLimit(env.RATE_LIMIT, `vision:${ip}`, 30, 60, env.RESTAURANT_BUCKET_PEPPER);
  c.header("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.allowed) {
    return c.json({ error: "Vision rate limit exceeded. Try again in a minute." }, 429);
  }

  let body: { urls?: unknown };
  try {
    body = (await c.req.json()) as { urls?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body.urls) || body.urls.length === 0) {
    return c.json({ error: "urls array required" }, 400);
  }
  // Enforce a hard cap to prevent a single request from draining budget.
  // Also parse each URL and reject anything that isn't http(s) or that's
  // absurdly long — the URL becomes part of a KV key (`vision:${url}`) so
  // we don't want callers stuffing arbitrary strings into the keyspace.
  //
  // SSRF gate: also reject private IP ranges, localhost, and the well-known
  // cloud metadata endpoint. Without this, a caller could feed a URL like
  // http://169.254.169.254/latest/meta-data/ and have the worker fetch it
  // as a reconnaissance probe. Hostname-form rejection covers the obvious
  // cases; full DNS-resolution rejection isn't possible from within the
  // worker runtime (no DNS API), but the worker only fetches public CDN
  // image URLs in practice — restricting to the known photo-host suffix
  // list locks this down further. Anything outside the allowlist below
  // is rejected.
  const PHOTO_HOST_ALLOWLIST = [
    "googleusercontent.com",       // Google Places photos
    "ggpht.com",                   // Google legacy
    "fastly.4sqi.net",             // Foursquare
    "fp.4sqi.net",                 // Foursquare
    "media.foursquare.com",
    "ls.hereapi.com",              // HERE
    "image.maps.ls.hereapi.com",   // HERE
    "static.openstreetmap.org",    // OSM
    "cdn.culvers.com",             // Culver's
    "www.culvers.com",
    "culvers.com",
  ];
  // Rejected exact hostnames (literals) — block obvious local/private hosts.
  // The CIDR check below catches ranges; this catches well-known names.
  const HOST_BLOCKLIST = new Set([
    "localhost",
    "ip6-localhost",
    "ip6-loopback",
    "metadata.google.internal",
  ]);
  function isPrivateOrLoopbackHost(host: string): boolean {
    if (HOST_BLOCKLIST.has(host)) return true;
    // IPv4 literal? Reject 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8
    const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const a = +ipv4[1], b = +ipv4[2];
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      return false;
    }
    // IPv6 literal — Hono parses [::1] as host "::1"
    if (host.includes(":")) {
      const lower = host.toLowerCase();
      if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd")) return true;
      if (lower.startsWith("fe80")) return true;
    }
    return false;
  }
  function isAllowedPhotoUrl(u: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLoopbackHost(host)) return false;
    // Exact match or subdomain match against the allowlist.
    return PHOTO_HOST_ALLOWLIST.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
  }

  const urls = body.urls
    .filter((u): u is string => typeof u === "string" && u.length > 0 && u.length <= 512)
    .filter(isAllowedPhotoUrl)
    .slice(0, 16);
  if (urls.length === 0) {
    return c.json({ error: "urls must point to a known photo host" }, 400);
  }

  // Prefer the dedicated VISION_CACHE namespace when bound — falling back
  // to RATE_LIMIT keeps existing deployments working but mixes vision
  // cache entries with rate-limit counters in the same namespace, which
  // can lead to rate-limit keys getting evicted under heavy vision load.
  // To migrate: `wrangler kv:namespace create VISION_CACHE`, then add the
  // binding to wrangler.toml. No code change required after that.
  const cacheKv =
    (env.VISION_CACHE as KVNamespace | undefined) ??
    (env.RATE_LIMIT as KVNamespace | undefined);
  const results: Record<string, "menu" | "food"> = {};
  const uncached: string[] = [];

  // Check KV cache first
  if (cacheKv) {
    await Promise.all(
      urls.map(async (url) => {
        try {
          const cached = await cacheKv.get(`vision:${url}`);
          if (cached === "menu" || cached === "food") {
            results[url] = cached;
          } else {
            uncached.push(url);
          }
        } catch {
          uncached.push(url);
        }
      })
    );
  } else {
    uncached.push(...urls);
  }

  if (uncached.length === 0) {
    return c.json({ results });
  }

  // Batch-call Vision for uncached URLs
  try {
    const reqBody = {
      requests: uncached.map((uri) => ({
        image: { source: { imageUri: uri } },
        features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
      })),
    };
    // Pass the API key in X-goog-api-key (header) instead of ?key= (query
    // string). Cloudflare's request analytics and any downstream proxy
    // that logs URLs would have captured the key in the query — header
    // form keeps it out of those records. Google Cloud Vision v1 accepts
    // both forms.
    let visionRes: Response;
    try {
      visionRes = await fetch(
        "https://vision.googleapis.com/v1/images:annotate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": visionKey,
          },
          body: JSON.stringify(reqBody),
          signal: AbortSignal.timeout(10000),
        }
      );
    } catch (err) {
      // AbortSignal.timeout() raises a TimeoutError (a DOMException).
      // Without an explicit catch, an unhandled rejection here could
      // bubble out and burn the rest of the 30 s CPU budget.
      const isAbort =
        (err as { name?: string })?.name === "AbortError" ||
        (err as { name?: string })?.name === "TimeoutError";
      console.warn(
        `[vision] fetch ${isAbort ? "timeout" : "error"}: ${(err as Error)?.message ?? err}`
      );
      return c.json({ results, error: "Vision API unreachable" }, 502);
    }
    if (!visionRes.ok) {
      // Return partial cached results on failure
      return c.json({ results, error: "Vision API error" }, 502);
    }
    const visionJson = (await visionRes.json()) as { responses?: any[] };
    const responses = visionJson.responses || [];

    await Promise.all(
      uncached.map(async (url, i) => {
        const r = responses[i];
        const text: string =
          r?.fullTextAnnotation?.text ||
          r?.textAnnotations?.[0]?.description ||
          "";
        const charCount = text.replace(/\s+/g, "").length;
        const wordCount = text.split(/\s+/).filter((w) => w.length > 1).length;
        const lineCount = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
        // Pass on EITHER (enough chars AND enough words) OR enough lines.
        // Catches dense printed menus (chars+words bar) and sparse chalkboards
        // / one-page menus (line bar) without re-admitting food photos
        // (which yield charCount≈0, lineCount≈0).
        const meetsTextBar =
          charCount >= VISION_MIN_CHARS && wordCount >= VISION_MIN_WORDS;
        const meetsLineBar = lineCount >= VISION_MIN_LINES;
        const label: "menu" | "food" = meetsTextBar || meetsLineBar ? "menu" : "food";
        results[url] = label;
        if (cacheKv) {
          try {
            await cacheKv.put(`vision:${url}`, label, {
              expirationTtl: VISION_CACHE_TTL,
            });
          } catch {
            // best effort
          }
        }
      })
    );

    return c.json({ results });
  } catch (err) {
    return c.json({ results, error: String(err) }, 500);
  }
});

// =============================================================================
// Google Places Photo Proxy
// =============================================================================
// Proxies Google Places photo requests so the API key never reaches the
// client. Photo URLs stored in D1/returned to the app use the format
// `/api/photo?ref=PHOTO_REFERENCE&maxwidth=800` instead of the raw
// Google endpoint with `?key=...`.
app.get("/api/photo", async (c) => {
  // Rate-limit per client IP so someone can't hammer this to burn
  // through Google Places photo quota.
  const ip = getClientIP(c);
  const rl = await checkRateLimit(c.env.RATE_LIMIT, `photo:${ip}`, 120, 60, c.env.RESTAURANT_BUCKET_PEPPER);
  c.header("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.allowed) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  const ref = c.req.query("ref");
  // Clamp maxwidth to prevent attackers from requesting absurdly large
  // images that waste bandwidth and Google API cost.
  const rawMaxwidth = parseInt(c.req.query("maxwidth") || "800", 10);
  const maxwidth = String(Math.min(Math.max(rawMaxwidth || 800, 100), 2000));
  if (!ref || ref.length > 2000) {
    return c.json({ error: "Missing or invalid ref" }, 400);
  }
  const apiKey = (c.env as any).GOOGLE_PLACES_API_KEY as string | undefined;
  if (!apiKey) {
    return c.json({ error: "Photo service not configured" }, 503);
  }
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${encodeURIComponent(maxwidth)}&photoreference=${encodeURIComponent(ref)}&key=${apiKey}`;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return c.json({ error: "Photo not found" }, 404);
    // Stream the image bytes through with correct content type
    const ct = res.headers.get("content-type") || "image/jpeg";
    return new Response(res.body, {
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return c.json({ error: "Photo fetch failed" }, 502);
  }
});

// =============================================================================
// Menu Photo API
// =============================================================================

// GET menu photos for a restaurant
app.get("/api/menu/:restaurantId", async (c) => {
  const restaurantId = c.req.param("restaurantId");
  const db = c.env.DB;
  if (!db) return c.json({ error: "DB not configured" }, 500);

  await ensureCacheTablesIfNeeded(db);
  try {
    const { results } = await db.prepare(
      "SELECT id, image_url, source, caption, sort_order FROM menu_photos WHERE restaurant_id = ? ORDER BY sort_order ASC, created_at DESC"
    ).bind(restaurantId).all();
    return c.json({ photos: results || [] });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// POST trigger menu discovery for a restaurant
// =============================================================================
// Crawls the restaurant's website, finds the actual menu page (or PDF),
// pulls down any embedded menu images, and persists them to menu_photos
// with source='website'. The mobile app calls this when opening the
// restaurant detail screen — subsequent GETs to /api/menu/:restaurantId
// then include the scraped images alongside any user uploads.
//
// Cached per-hostname in menu_discovery_cache for 7 days so we don't
// hammer the same site for every diner who opens the screen. Cached
// negative results (no menu found) get a shorter TTL (1 day) so we
// retry sooner once the site gets a menu page.
app.post("/api/menu/discover", async (c) => {
  const env = c.env as any;
  const db = c.env.DB;
  if (!db) return c.json({ error: "DB not configured" }, 500);

  await ensureCacheTablesIfNeeded(db);

  // Rate-limit per client IP — discovery does up to ~13 outbound fetches
  // per call so a single IP shouldn't be able to burn through cycles.
  const ip = getClientIP(c);
  const rl = await checkRateLimit(env.RATE_LIMIT, `discover:${ip}`, 20, 60, env.RESTAURANT_BUCKET_PEPPER);
  c.header("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.allowed) {
    return c.json({ error: "Discovery rate limit exceeded. Try again in a minute." }, 429);
  }

  let body: { restaurantId?: unknown; website?: unknown };
  try {
    body = (await c.req.json()) as { restaurantId?: unknown; website?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const website = typeof body.website === "string" ? body.website : "";
  if (!/^[\w-]{1,128}$/.test(restaurantId)) {
    return c.json({ error: "Invalid restaurant ID" }, 400);
  }
  if (!website || website.length > 2000) {
    return c.json({ error: "website required" }, 400);
  }

  const host = cacheKeyForWebsite(website);
  if (!host) {
    return c.json({ error: "Invalid website URL" }, 400);
  }

  // Check the per-host discovery cache first.
  try {
    const nowIso = new Date().toISOString();
    const cached = await db
      .prepare(
        "SELECT menu_url, is_pdf, images FROM menu_discovery_cache WHERE host = ? AND expires_at > ?"
      )
      .bind(host, nowIso)
      .first<{ menu_url: string | null; is_pdf: number; images: string }>();
    if (cached) {
      const images: string[] = (() => {
        try { return JSON.parse(cached.images) as string[]; } catch { return []; }
      })();
      // Even on cache hit we ensure the menu_photos rows exist for THIS
      // restaurant (a different restaurant on the same host hasn't been
      // populated yet).
      if (images.length) {
        await persistScrapedImages(db, restaurantId, images);
      }
      return c.json({
        cached: true,
        menuUrl: cached.menu_url || undefined,
        isPdf: cached.is_pdf === 1,
        images,
      });
    }
  } catch {
    // Cache lookup failure shouldn't block discovery.
  }

  const result = await discoverMenu(website);

  // Cache hit-or-miss. 7 days for hits, 1 day for misses (retry sooner
  // once a site gets a menu page).
  const ttlSeconds = result.menuUrl ? 7 * 24 * 60 * 60 : 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  try {
    await db
      .prepare(
        "INSERT INTO menu_discovery_cache (host, menu_url, is_pdf, images, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(host) DO UPDATE SET menu_url = excluded.menu_url, is_pdf = excluded.is_pdf, images = excluded.images, expires_at = excluded.expires_at, created_at = datetime('now')"
      )
      .bind(host, result.menuUrl || null, result.isPdf ? 1 : 0, JSON.stringify(result.images), expiresAt)
      .run();
  } catch (err) {
    console.warn("[discover] cache write failed:", err);
  }

  if (result.images.length) {
    await persistScrapedImages(db, restaurantId, result.images);
  }

  return c.json({
    cached: false,
    menuUrl: result.menuUrl,
    isPdf: result.isPdf,
    images: result.images,
  });
});

async function persistScrapedImages(
  db: any,
  restaurantId: string,
  imageUrls: string[]
): Promise<void> {
  if (!imageUrls.length) return;
  try {
    // Insert one row per image with a deterministic id so re-running
    // discovery for the same restaurant doesn't create duplicates.
    const stmts = imageUrls.slice(0, 10).map((url, i) => {
      // Cheap hash so the same URL produces the same id — keeps the
      // per-restaurant cap (MAX_PHOTOS_PER_RESTAURANT) from inflating
      // every time discovery runs.
      let hash = 5381;
      for (let k = 0; k < url.length; k++) {
        hash = ((hash << 5) + hash + url.charCodeAt(k)) | 0;
      }
      const id = `web_${restaurantId}_${Math.abs(hash).toString(36)}_${i}`;
      return db
        .prepare(
          "INSERT OR IGNORE INTO menu_photos (id, restaurant_id, image_url, source, sort_order) VALUES (?, ?, ?, 'website', ?)"
        )
        .bind(id, restaurantId, url, i);
    });
    await db.batch(stmts);
  } catch (err) {
    console.warn("[discover] persistScrapedImages failed:", err);
  }
}

// POST upload menu photo
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_REQUEST = 5;
const MAX_PHOTOS_PER_RESTAURANT = 20;

/**
 * Sniff the actual file content type from magic bytes. We do NOT trust
 * the client-supplied Content-Type header — anyone can label a PHP file
 * as image/jpeg. Returns the sniffed MIME or null if the bytes don't
 * match any allowed format.
 */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  // WebP: RIFF ???? WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  // HEIC/HEIF: ftyp box at offset 4, brand at offset 8
  if (
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
    (
      // heic, heix, hevc, heim, heis, hevm, hevs, mif1, msf1
      (bytes[8] === 0x68 && bytes[9] === 0x65 && bytes[10] === 0x69) ||
      (bytes[8] === 0x68 && bytes[9] === 0x65 && bytes[10] === 0x76) ||
      (bytes[8] === 0x6d && bytes[9] === 0x69 && bytes[10] === 0x66) ||
      (bytes[8] === 0x6d && bytes[9] === 0x73 && bytes[10] === 0x66)
    )
  ) return "image/heic";
  // GIF: 47 49 46 38 37 61 or 47 49 46 38 39 61
  if (
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) return "image/gif";
  return null;
}

app.post("/api/menu/:restaurantId/upload", async (c) => {
  const restaurantId = c.req.param("restaurantId");
  const bucket = c.env.MENU_PHOTOS;
  const db = c.env.DB;
  if (!bucket || !db) return c.json({ error: "Storage not configured" }, 500);

  await ensureCacheTablesIfNeeded(db);

  // Validate restaurantId format (alphanumeric, hyphens, underscores only)
  if (!/^[\w-]{1,128}$/.test(restaurantId)) {
    return c.json({ error: "Invalid restaurant ID" }, 400);
  }

  // Enforce per-restaurant cap to stop a single restaurant's bucket
  // from being filled indefinitely by one attacker.
  try {
    const countRow = await db
      .prepare("SELECT COUNT(*) AS n FROM menu_photos WHERE restaurant_id = ?")
      .bind(restaurantId)
      .first<{ n: number }>();
    const currentCount = Number(countRow?.n ?? 0);
    if (currentCount >= MAX_PHOTOS_PER_RESTAURANT) {
      return c.json(
        { error: `This restaurant already has the maximum ${MAX_PHOTOS_PER_RESTAURANT} menu photos.` },
        429
      );
    }
  } catch {
    // If the count query fails we still proceed — the per-request limit
    // and per-IP rate limit still bound the blast radius.
  }

  try {
    const formData = await c.req.formData();
    const uploaded: string[] = [];
    let fileCount = 0;

    for (const [key, formValue] of (formData as any).entries()) {
      if (typeof formValue === "string") continue;
      // Cast to Blob — Cloudflare Workers FormData returns File (extends Blob)
      const file = formValue as unknown as { type: string; size: number; name: string; arrayBuffer(): Promise<ArrayBuffer> };

      fileCount++;
      if (fileCount > MAX_FILES_PER_REQUEST) {
        return c.json({ error: `Max ${MAX_FILES_PER_REQUEST} files per request` }, 400);
      }

      // Validate claimed file type — first gate
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return c.json({ error: `File type '${file.type}' not allowed.` }, 400);
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return c.json({ error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }, 400);
      }

      // Content sniffing — don't trust the client-supplied type header.
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const sniffedType = sniffImageType(bytes);
      if (!sniffedType || !ALLOWED_MIME_TYPES.has(sniffedType)) {
        return c.json(
          { error: "File content does not match an allowed image format." },
          400
        );
      }

      const id = `menu_${restaurantId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif" };
      const ext = extMap[sniffedType] || "jpg";
      const r2Key = `menus/${restaurantId}/${id}.${ext}`;
      const imageUrl = `https://foodie-finder-menus.sassyconsultingllc.com/${r2Key}`;

      // Write D1 FIRST, then R2. If the D1 insert fails we don't leave
      // an orphaned R2 object behind. If the R2 put fails after a
      // successful D1 insert, we roll the D1 row back.
      try {
        await db.prepare(
          "INSERT INTO menu_photos (id, restaurant_id, image_url, source, caption) VALUES (?, ?, ?, 'user', ?)"
        ).bind(id, restaurantId, imageUrl, key === "caption" ? String(formValue) : null).run();
      } catch (dbErr) {
        return c.json({ error: "Failed to save menu photo. Please try again." }, 500);
      }

      try {
        await bucket.put(r2Key, arrayBuffer, {
          httpMetadata: { contentType: sniffedType },
        });
      } catch (putErr) {
        // Roll back the D1 row
        try {
          await db.prepare("DELETE FROM menu_photos WHERE id = ?").bind(id).run();
        } catch { /* best effort */ }
        throw putErr;
      }

      uploaded.push(imageUrl);
    }

    if (uploaded.length === 0) {
      return c.json({ error: "No valid image files provided" }, 400);
    }

    return c.json({ ok: true, uploaded });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// =============================================================================
// Anonymous community photos (bucket-keyed, EXIF-stripped, SafeSearch-gated)
// =============================================================================

/** Base32-free chunked base64 of raw bytes (for Vision image.content). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Moderate an uploaded image with Google Vision: reject explicit content
 * (SafeSearch) and reject anything that isn't a menu (dense OCR text, same
 * thresholds as /api/vision/classify). FAILS CLOSED — if Vision isn't
 * configured or is unreachable, the upload is refused rather than stored
 * unmoderated.
 */
async function moderateImage(
  env: Env,
  bytes: Uint8Array
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const visionKey = (env as any).GOOGLE_VISION_API_KEY as string | undefined;
  if (!visionKey) {
    return { ok: false, reason: "Image moderation is not configured." };
  }
  let res: Response;
  try {
    res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": visionKey },
      body: JSON.stringify({
        requests: [
          {
            image: { content: bytesToBase64(bytes) },
            features: [
              { type: "SAFE_SEARCH_DETECTION" },
              { type: "TEXT_DETECTION", maxResults: 1 },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, reason: "Moderation service unreachable. Please try again." };
  }
  if (!res.ok) return { ok: false, reason: "Moderation service error. Please try again." };
  const json = (await res.json()) as { responses?: any[] };
  const r = json.responses?.[0];

  // SafeSearch — reject explicit/violent imagery.
  const ss = r?.safeSearchAnnotation || {};
  const bad = new Set(["LIKELY", "VERY_LIKELY"]);
  if (bad.has(ss.adult) || bad.has(ss.violence) || bad.has(ss.racy)) {
    return { ok: false, reason: "This image was flagged as inappropriate and can't be posted." };
  }

  // Menu classifier — must look like a menu, not a random/storefront photo.
  const text: string =
    r?.fullTextAnnotation?.text || r?.textAnnotations?.[0]?.description || "";
  const charCount = text.replace(/\s+/g, "").length;
  const wordCount = text.split(/\s+/).filter((w) => w.length > 1).length;
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  const isMenu =
    (charCount >= VISION_MIN_CHARS && wordCount >= VISION_MIN_WORDS) ||
    lineCount >= VISION_MIN_LINES;
  if (!isMenu) {
    return {
      ok: false,
      reason: "This doesn't look like a menu photo. Please upload a clear photo of the menu.",
    };
  }
  return { ok: true };
}

let communityPhotoTableReady = false;
async function ensureCommunityPhotoTable(db: any): Promise<void> {
  if (communityPhotoTableReady) return;
  // Keyed ONLY by the opaque bucket — no restaurant_id, no uploader, no FK.
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS community_photos (id TEXT PRIMARY KEY, bucket_id TEXT NOT NULL, r2_key TEXT NOT NULL, caption TEXT, created_at TEXT DEFAULT (datetime('now')))"
    )
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_community_photos_bucket ON community_photos(bucket_id)")
    .run();
  communityPhotoTableReady = true;
}

const COMMUNITY_PHOTO_BASE_URL = "https://foodie-finder-menus.sassyconsultingllc.com/";

// Upload an anonymous community menu photo. Client sends {name,lat,lng,image};
// the bucket is computed here and is the ONLY key persisted. The image is
// EXIF-stripped and SafeSearch/menu-gated before storage. Nothing identifying
// is logged or returned.
app.post("/api/community/photo", async (c) => {
  const r2 = c.env.MENU_PHOTOS;
  const db = c.env.DB;
  const pepper = c.env.RESTAURANT_BUCKET_PEPPER;
  if (!r2 || !db) return c.json({ error: "Storage not configured" }, 500);
  if (!pepper) return c.json({ error: "Anonymous uploads are not configured." }, 503);

  // Rate-limit per IP (salted-hash key; raw IP never stored).
  const ip = getClientIP(c);
  const rl = await checkRateLimit(c.env.RATE_LIMIT, `community:${ip}`, 10, 60, pepper);
  c.header("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.allowed) {
    return c.json({ error: "Upload rate limit exceeded. Try again in a minute." }, 429);
  }

  await ensureCommunityPhotoTable(db);

  try {
    const form = await c.req.formData();
    const name = String(form.get("name") || "");
    const lat = Number(form.get("lat"));
    const lng = Number(form.get("lng"));
    const captionRaw = form.get("caption");
    const file = form.get("image");
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return c.json({ error: "Missing restaurant identity" }, 400);
    }
    if (!file || typeof file === "string") {
      return c.json({ error: "No image provided" }, 400);
    }
    const blob = file as unknown as { size: number; arrayBuffer(): Promise<ArrayBuffer> };
    if (blob.size > MAX_FILE_SIZE) {
      return c.json({ error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }, 400);
    }

    const raw = new Uint8Array(await blob.arrayBuffer());

    // 1. Strip EXIF/metadata. Fail CLOSED — never store an image we can't strip.
    let stripped;
    try {
      stripped = stripImageMetadata(raw);
    } catch {
      return c.json({ error: "Unsupported or unreadable image (JPEG or PNG only)." }, 400);
    }

    // 2. Compute the opaque bucket (server-side only; never logged or returned).
    let bucketId: string;
    try {
      bucketId = await computeBucketId(pepper, name, lat, lng);
    } catch {
      return c.json({ error: "Could not identify this restaurant." }, 400);
    }

    // 3. Per-bucket cap.
    try {
      const row = await db
        .prepare("SELECT COUNT(*) AS n FROM community_photos WHERE bucket_id = ?")
        .bind(bucketId)
        .first<{ n: number }>();
      if (Number(row?.n ?? 0) >= MAX_PHOTOS_PER_RESTAURANT) {
        return c.json(
          { error: `This place already has the maximum ${MAX_PHOTOS_PER_RESTAURANT} community photos.` },
          429
        );
      }
    } catch {
      /* proceed — other limits bound the blast radius */
    }

    // 4. SafeSearch + menu-classifier gate (fails closed if Vision is absent).
    const gate = await moderateImage(c.env, stripped.bytes);
    if (!gate.ok) return c.json({ error: gate.reason }, 400);

    // 5. Store, keyed only by the bucket.
    const id = crypto.randomUUID();
    const ext = stripped.format === "png" ? "png" : "jpg";
    const contentType = stripped.format === "png" ? "image/png" : "image/jpeg";
    const r2Key = `community/${bucketId}/${id}.${ext}`;
    const caption = typeof captionRaw === "string" ? captionRaw.slice(0, 140) : null;

    try {
      await db
        .prepare("INSERT INTO community_photos (id, bucket_id, r2_key, caption) VALUES (?, ?, ?, ?)")
        .bind(id, bucketId, r2Key, caption)
        .run();
    } catch {
      return c.json({ error: "Failed to save photo." }, 500);
    }
    try {
      await r2.put(r2Key, stripped.bytes, { httpMetadata: { contentType } });
    } catch {
      try {
        await db.prepare("DELETE FROM community_photos WHERE id = ?").bind(id).run();
      } catch {
        /* best effort */
      }
      return c.json({ error: "Failed to store image." }, 500);
    }
    // NO-IDENTITY-LOGGING: never log name/lat/lng or bucketId.
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Upload failed." }, 500);
  }
});

// List anonymous community photos for a restaurant identity. Client sends
// {name,lat,lng} as query params; the bucket is computed here and never
// returned. Only opaque image URLs come back.
app.get("/api/community/photos", async (c) => {
  const db = c.env.DB;
  const pepper = c.env.RESTAURANT_BUCKET_PEPPER;
  if (!db || !pepper) return c.json({ photos: [] });
  const name = c.req.query("name") || "";
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ photos: [] });
  }
  await ensureCommunityPhotoTable(db);
  let bucketId: string;
  try {
    bucketId = await computeBucketId(pepper, name, lat, lng);
  } catch {
    return c.json({ photos: [] });
  }
  try {
    const rows = await db
      .prepare(
        "SELECT r2_key, caption, created_at FROM community_photos WHERE bucket_id = ? ORDER BY created_at DESC LIMIT 50"
      )
      .bind(bucketId)
      .all<{ r2_key: string; caption: string | null; created_at: string }>();
    const photos = (rows.results || []).map((r) => ({
      url: COMMUNITY_PHOTO_BASE_URL + r.r2_key,
      caption: r.caption,
      createdAt: r.created_at,
    }));
    return c.json({ photos });
  } catch {
    return c.json({ photos: [] });
  }
});

// (Removed duplicate /api/debug/geocode definition + dead `origGeocodeHandler`
// alias. The route is defined once near the top of the file with the
// (0,0) error guard already in place — the second copy here was a
// leftover patch attempt that never wired itself in.)

// tRPC endpoint. We DON'T pass the Hono `c` through anymore — earlier
// rounds tried to use it to set response headers (e.g. X-RateLimit-
// Remaining), but fetchRequestHandler builds its own Response and Hono
// can't decorate it after the fact, so c.header() was a silent no-op.
// Procedures that need to surface rate-limit info include it in the
// response body instead.
app.all("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({ env: c.env, req: c.req.raw }),
  });
});

// 404
app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
