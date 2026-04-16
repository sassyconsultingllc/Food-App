/**
 * Cloudflare Worker Entry Point
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc-router";
import { scrapeRestaurants, getCoords } from "./scraper";
import type { Env } from "./context";
import type { KVNamespace } from "@cloudflare/workers-types";

const app = new Hono<{ Bindings: Env }>();

// =============================================================================
// Rate Limiting Middleware (KV-based sliding window)
// =============================================================================
async function checkRateLimit(
  kv: KVNamespace | undefined,
  key: string,
  maxRequests: number,
  windowSeconds: number
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
  const storageKey = `rl:${key}`;

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
  const { allowed, remaining } = await checkRateLimit(c.env.RATE_LIMIT, `trpc:${ip}`, 60, 60);
  c.header("X-RateLimit-Remaining", String(remaining));
  if (!allowed) return c.json({ error: "Rate limit exceeded. Try again in a minute." }, 429);
  await next();
});

// Rate limit: uploads — 10 req/min per IP
app.use("/api/menu/*/upload", async (c, next) => {
  const ip = getClientIP(c);
  const { allowed, remaining } = await checkRateLimit(c.env.RATE_LIMIT, `upload:${ip}`, 10, 60);
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
    const rawHeaders = c.req?.raw?.headers
      ? Object.fromEntries(c.req.raw.headers.entries())
      : (c.req.header() as Record<string, string>);
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
const VISION_MIN_CHARS = 250;
const VISION_MIN_WORDS = 40;
const VISION_MIN_LINES = 8;
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
  const rl = await checkRateLimit(env.RATE_LIMIT, `vision:${ip}`, 30, 60);
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
  const urls = body.urls
    .filter((u): u is string => typeof u === "string" && u.length > 0 && u.length <= 512)
    .filter((u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    })
    .slice(0, 16);
  if (urls.length === 0) {
    return c.json({ error: "urls must contain valid http(s) URLs" }, 400);
  }

  const cacheKv = env.RATE_LIMIT as KVNamespace | undefined;
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
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(10000),
      }
    );
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
        const label: "menu" | "food" =
          charCount >= VISION_MIN_CHARS &&
          wordCount >= VISION_MIN_WORDS &&
          lineCount >= VISION_MIN_LINES
            ? "menu"
            : "food";
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
  const rl = await checkRateLimit(c.env.RATE_LIMIT, `photo:${ip}`, 120, 60);
  c.header("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.allowed) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  const ref = c.req.query("ref");
  const maxwidth = c.req.query("maxwidth") || "800";
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

  try {
    const { results } = await db.prepare(
      "SELECT id, image_url, source, caption, sort_order FROM menu_photos WHERE restaurant_id = ? ORDER BY sort_order ASC, created_at DESC"
    ).bind(restaurantId).all();
    return c.json({ photos: results || [] });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// POST upload menu photo
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
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
  return null;
}

app.post("/api/menu/:restaurantId/upload", async (c) => {
  const restaurantId = c.req.param("restaurantId");
  const bucket = c.env.MENU_PHOTOS;
  const db = c.env.DB;
  if (!bucket || !db) return c.json({ error: "Storage not configured" }, 500);

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
      const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
      const ext = extMap[sniffedType] || "jpg";
      const r2Key = `menus/${restaurantId}/${id}.${ext}`;
      const imageUrl = `https://foodie-finder-menus.sassyconsultingllc.com/${r2Key}`;

      // Write D1 FIRST, then R2. If the D1 insert fails we don't leave
      // an orphaned R2 object behind. If the R2 put fails after a
      // successful D1 insert, we roll the D1 row back.
      await db.prepare(
        "INSERT INTO menu_photos (id, restaurant_id, image_url, source, caption) VALUES (?, ?, ?, 'user', ?)"
      ).bind(id, restaurantId, imageUrl, key === "caption" ? String(formValue) : null).run();

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

// tRPC endpoint
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
