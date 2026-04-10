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
  if (!kv) return { allowed: true, remaining: maxRequests }; // skip if KV not bound

  const now = Math.floor(Date.now() / 1000);
  const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`;

  const current = parseInt(await kv.get(windowKey) || "0", 10);
  if (current >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  await kv.put(windowKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return { allowed: true, remaining: maxRequests - current - 1 };
}

function getClientIP(c: any): string {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0] || "unknown";
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

// CORS — restrict to known origins
const ALLOWED_ORIGINS = [
  "https://foodie-finder.sassyconsultingllc.com",
  "http://localhost:8081",  // Expo dev
  "http://localhost:19006", // Expo web dev
];
app.use("/*", cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Health check
app.get("/api/health", (c) => {
  return c.json({ ok: true, timestamp: Date.now(), runtime: "cloudflare-workers" });
});

// Debug inspect endpoint (safe: does NOT return secret values)
app.all('/api/debug/inspect', async (c) => {
  try {
    const method = c.req.method;
    const url = c.req.url;
    const headers = c.req?.raw?.headers ? Object.fromEntries(c.req.raw.headers.entries()) : (c.req.header() as Record<string, string>);
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

app.post("/api/menu/:restaurantId/upload", async (c) => {
  const restaurantId = c.req.param("restaurantId");
  const bucket = c.env.MENU_PHOTOS;
  const db = c.env.DB;
  if (!bucket || !db) return c.json({ error: "Storage not configured" }, 500);

  // Validate restaurantId format (alphanumeric, hyphens, underscores only)
  if (!/^[\w-]{1,128}$/.test(restaurantId)) {
    return c.json({ error: "Invalid restaurant ID" }, 400);
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

      // Validate file type
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return c.json({ error: `File type '${file.type}' not allowed. Accepted: ${[...ALLOWED_MIME_TYPES].join(", ")}` }, 400);
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return c.json({ error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }, 400);
      }

      const id = `menu_${restaurantId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Use the validated MIME type for extension, not the user-supplied filename
      const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
      const ext = extMap[file.type] || "jpg";
      const r2Key = `menus/${restaurantId}/${id}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      await bucket.put(r2Key, arrayBuffer, {
        httpMetadata: { contentType: file.type },
      });

      const imageUrl = `https://foodie-finder-menus.sassyconsultingllc.com/${r2Key}`;

      await db.prepare(
        "INSERT INTO menu_photos (id, restaurant_id, image_url, source, caption) VALUES (?, ?, ?, 'user', ?)"
      ).bind(id, restaurantId, imageUrl, key === "caption" ? String(formValue) : null).run();

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
