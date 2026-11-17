// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-M5S5YJ4YWIKB
/**
 * Restaurant Scraper for Cloudflare Workers - INTERNATIONAL
 * Â© 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Fetches restaurant data from multiple APIs worldwide.
 * No country restrictions - works globally.
 */

import { inferSentimentFromMetadata, SentimentResult } from "./sentiment";
// Unicode-aware. The old local copy kept only [a-z0-9], so every name in
// Arabic, CJK, Thai, Cyrillic or Greek normalized to "" and was dropped by
// mergeRestaurants (Riyadh and Cairo returned nothing, Seoul and Shanghai 2).
import { normalizeRestaurantName } from "./restaurant-bucket";
import { toAlpha2, alpha2 } from "./country-codes";
import { normalizeHours } from "../utils/culvers-hours";
import { extractReviewAspects, type ReviewAspect } from "./review-aspects";

export interface ScrapedRestaurant {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;      // Renamed from zipCode for international clarity
  country: string;          // NEW: Country name
  countryCode: string;      // NEW: ISO 3166-1 alpha-2
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
  ratings: {
    foursquare?: number;
    foursquareReviewCount?: number;
    here?: number;
    hereReviewCount?: number;
    google?: number;
    googleReviewCount?: number;
    aggregated: number;
    totalReviews: number;
  };
  priceRange?: string;
  cuisineType: string;
  categories?: string[];
  hours?: Record<string, string>;
  /** Restaurant-local offset from UTC (Google `utc_offset_minutes`). */
  utcOffsetMinutes?: number;
  photos?: string[];
  isCulvers?: boolean;
  flavorOfTheDay?: string;
  flavorDescription?: string;
  /** Store-local date (YYYY-MM-DD) the flavor fields are for. */
  flavorDate?: string;
  reviewSummary: string;
  sentiment?: SentimentResult;
  /**
   * Aspect verdicts mined from review text ("Best place for quiet
   * atmosphere", "Great oceanside coffee"). Raw review text is never stored
   * or returned, only these derived labels.
   */
  reviewAspects?: ReviewAspect[];
  /** Google's one-line editorial description of the place, when it has one. */
  editorialSummary?: string;
  // Generated URLs for external services
  yelpUrl?: string;
  googleMapsUrl?: string;
  // Delivery service URLs
  doordashUrl?: string;
  ubereatsUrl?: string;
  grubhubUrl?: string;
  menuUrl?: string;
  scrapedAt: string;
  sources: string[];
  // Legacy alias for backward compatibility
  zipCode?: string;
}

interface GeoCoords {
  lat: number;
  lng: number;
  country?: string;
  countryCode?: string;
  city?: string;
  state?: string;
}

interface ScrapeOptions {
  postalCode: string;       // International postal code
  countryCode?: string;     // Optional: ISO country code to narrow geocoding
  radius: number;           // In miles (converted to meters for APIs)
  radiusUnit?: 'miles' | 'km';
  cuisineType?: string;
  limit: number;
  foursquareKey: string;
  hereKey: string;
  googleKey: string;
}

// In-memory geocode cache for the worker. Bounded LRU so a long-running
// isolate can't grow the Map without bound — every unique postal+country
// pair used to stay forever. Insertion order = LRU; on overflow we drop
// the oldest key.
const GEOCODE_CACHE_MAX = 500;
const geocodeCache = new Map<string, GeoCoords>();
function geocodeCacheSet(key: string, value: GeoCoords) {
  // Refresh LRU position on re-set
  if (geocodeCache.has(key)) geocodeCache.delete(key);
  geocodeCache.set(key, value);
  while (geocodeCache.size > GEOCODE_CACHE_MAX) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest === undefined) break;
    geocodeCache.delete(oldest);
  }
}
function geocodeCacheGet(key: string): GeoCoords | undefined {
  const v = geocodeCache.get(key);
  if (v !== undefined) {
    // LRU touch
    geocodeCache.delete(key);
    geocodeCache.set(key, v);
  }
  return v;
}

/**
 * Map short day-name prefixes (as returned by HERE and Google weekday_text)
 * to the full lowercase day keys the client UI expects (hours.monday, etc).
 * Previously HERE hours were written with short keys like "mon" and the UI
 * silently dropped every one of them.
 */
const DAY_KEY_MAP: Record<string, string> = {
  mon: "monday", monday: "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday",
  fri: "friday", friday: "friday",
  sat: "saturday", saturday: "saturday",
  sun: "sunday", sunday: "sunday",
};

function parseHereHours(openingHours: any): Record<string, string> | undefined {
  if (!openingHours) return undefined;
  const text = Array.isArray(openingHours) ? openingHours[0]?.text : openingHours.text;
  if (!Array.isArray(text)) return undefined;
  const out: Record<string, string> = {};
  for (const line of text) {
    const m = typeof line === "string" && line.match(/^(\w+):\s*(.+)$/);
    if (m) {
      const key = DAY_KEY_MAP[m[1].toLowerCase()];
      if (key) out[key] = m[2];
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function parseFoursquareHours(h: any): Record<string, string> | undefined {
  // FSQ v3 `hours.regular` is an array of
  // { day: 1..7, open: "HHmm", close: "HHmm" }.
  // Per current FSQ v3 docs: day 1 = Monday, 7 = Sunday.
  const regular = h?.regular;
  if (!Array.isArray(regular) || regular.length === 0) return undefined;
  // FSQ v3: day 1=Monday, 2=Tuesday, ..., 7=Sunday. Index directly.
  const dayByIndex = ["", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const out: Record<string, string> = {};
  for (const entry of regular) {
    if (!entry || typeof entry.day !== "number") continue;
    const key = dayByIndex[entry.day];
    if (!key) continue;
    const open = formatHHmm(entry.open);
    const close = formatHHmm(entry.close);
    if (open && close) {
      out[key] = out[key] ? `${out[key]}, ${open} - ${close}` : `${open} - ${close}`;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function formatHHmm(s: unknown): string | undefined {
  if (typeof s !== "string" || s.length !== 4) return undefined;
  return `${s.slice(0, 2)}:${s.slice(2)}`;
}

function parseGoogleWeekdayText(arr: any): Record<string, string> | undefined {
  // Google Place Details weekday_text is ["Monday: 11:00 AM – 10:00 PM", ...]
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const line of arr) {
    const m = typeof line === "string" && line.match(/^(\w+):\s*(.+)$/);
    if (m) {
      const key = DAY_KEY_MAP[m[1].toLowerCase()];
      if (key) out[key] = m[2];
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Fetch with a hard timeout so a hung upstream (Nominatim, Google, HERE,
 * Foursquare, OSM Overpass) never leaves the scraper promise dangling —
 * Workers have a 30s CPU budget and we'd rather fail fast and fall back
 * to another source than time the whole search out. S28.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
// Paid providers that are out of credit, over quota or rejecting the key fail
// the same way on every request. Skip them for a while instead of paying a
// round trip (and a log line) per search; the free providers still answer.
// Per isolate, so a fixed key or new credits take effect within the window.
const PROVIDER_COOLDOWN_MS = 10 * 60 * 1000;
const providerDownUntil = new Map<string, number>();
function providerDown(name: string): boolean {
  return (providerDownUntil.get(name) ?? 0) > Date.now();
}
function markProviderDown(name: string, why: string) {
  providerDownUntil.set(name, Date.now() + PROVIDER_COOLDOWN_MS);
  console.warn(`[Scraper] ${name} disabled for ${PROVIDER_COOLDOWN_MS / 60000} min: ${why}`);
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  // private.coffee and kumi.systems timed out from Workers on 2026-11-09.
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
] as const;

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && (AbortSignal as any).timeout
      ? (AbortSignal as any).timeout(timeoutMs)
      : undefined;
  return fetch(input as any, { ...init, signal });
}

/**
 * Geocode a postal code to coordinates - INTERNATIONAL
 * Uses Nominatim (OpenStreetMap) - no country restriction
 */
export async function getCoords(postalCode: string, countryCode?: string): Promise<GeoCoords> {
  const cacheKey = countryCode ? `${postalCode}:${countryCode}` : postalCode;
  
  const hit = geocodeCacheGet(cacheKey);
  if (hit) return hit;
  
  try {
    // If caller didn't provide a countryCode and the postal code looks like a
    // 5-digit US ZIP, prefer geocoding with countrycodes=us first to avoid
    // ambiguous international matches (e.g., some German postcodes).
    const looksLikeUSZip = /^[0-9]{5}$/.test(postalCode);

    const buildAndFetch = async (cc?: string) => {
      const u = new URL('https://nominatim.openstreetmap.org/search');
      u.searchParams.set('postalcode', postalCode);
      u.searchParams.set('format', 'json');
      u.searchParams.set('limit', '1');
      u.searchParams.set('addressdetails', '1');
      if (cc) u.searchParams.set('countrycodes', cc.toLowerCase());

      const r = await fetchWithTimeout(u.toString(), {
        headers: { 'User-Agent': 'FoodieFinder/2.0 (International)' },
      });
      if (!r.ok) return [] as any[];
      return await r.json() as any[];
    };

    let data: any[] = [];

    if (!countryCode && looksLikeUSZip) {
      // Try US first
      data = await buildAndFetch('US');
      if (!data || data.length === 0) {
        // Fallback to an unrestricted search
        data = await buildAndFetch();
      }
    } else {
      data = await buildAndFetch(countryCode);
    }

    if (data.length > 0) {
      const result = data[0];
      const address = result.address || {};

      const coords: GeoCoords = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        country: address.country,
        countryCode: address.country_code?.toUpperCase(),
        city: address.city || address.town || address.village,
        state: address.state || address.province || address.region,
      };

      geocodeCacheSet(cacheKey, coords);
      return coords;
    }
  } catch (e) {
    console.error('[Scraper] Geocoding failed:', e);
  }
  
  // No default fallback location - return error-indicative coords
  console.warn(`[Scraper] Could not geocode postal code: ${postalCode}`);
  return { lat: 0, lng: 0, country: 'Unknown', countryCode: 'XX' };
}

/**
 * Convert radius to meters
 */
function toMeters(radius: number, unit: 'miles' | 'km' = 'miles'): number {
  const km = unit === 'km' ? radius : radius * 1.60934;
  return Math.round(km * 1000);
}

async function fetchFoursquare(
  coords: GeoCoords,
  radiusMeters: number,
  apiKey: string,
  limit: number
): Promise<Partial<ScrapedRestaurant>[]> {
  if (!apiKey || providerDown('Foursquare')) return [];

  try {
    // New Foursquare Places API (FSQ OS). The legacy v3 host
    // (api.foursquare.com/v3) is deprecated (sunset 2026-05-15) and rejects
    // current-console keys with HTTP 400 "Please provide a valid version."
    // The new API: places-api.foursquare.com, Bearer auth, and a REQUIRED
    // X-Places-Api-Version date header. Field/param renames: categories ->
    // fsq_category_ids, fsq_id -> fsq_place_id, geocodes.main -> top-level
    // latitude/longitude. We parse defensively (new || legacy) so a partial
    // rollback or field drift can't null the whole record.
    const url = new URL('https://places-api.foursquare.com/places/search');
    url.searchParams.set('ll', `${coords.lat},${coords.lng}`);
    url.searchParams.set('radius', String(Math.min(radiusMeters, 100000)));
    url.searchParams.set('fsq_category_ids', '13065'); // Dining and Drinking
    url.searchParams.set('limit', String(Math.min(limit, 50)));
    // Pro fields only. Asking for any Premium field (rating, hours, tel,
    // website, price, photos, tips) bills the whole call as Premium from the
    // first request, which is what used up the account's credits. Ratings,
    // hours and contact details come from Google and HERE instead.
    url.searchParams.set('fields', 'fsq_place_id,name,location,categories,latitude,longitude');

    // Trim the key — a trailing newline from `wrangler secret put` corrupts
    // the `Bearer <key>` header (FSQ edge returns 400-empty instead of a clean
    // 401). Cheap insurance against paste artifacts.
    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: 'application/json',
        'X-Places-Api-Version': '2025-06-17',
      },
    });

    if (!res.ok) {
      // Surface the FSQ error body (e.g. quota/credit messages) — status alone
      // hides "no API credits remaining" (429) vs a real auth failure (401).
      const body = await res.text().catch(() => '');
      console.error(`[Scraper] Foursquare error: ${res.status} ${body.slice(0, 120)}`);
      if ([401, 402, 403, 429].includes(res.status)) markProviderDown('Foursquare', `HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    return (data.results || []).map((p: any) => {
      const id = p.fsq_place_id || p.fsq_id;
      const lat = p.latitude ?? p.geocodes?.main?.latitude ?? coords.lat;
      const lng = p.longitude ?? p.geocodes?.main?.longitude ?? coords.lng;
      const country = p.location?.country || coords.countryCode || '';
      return {
        id: `fsq_${id}`,
        name: p.name,
        address: p.location?.formatted_address || p.location?.address || '',
        city: p.location?.locality || coords.city || '',
        state: p.location?.region || coords.state || '',
        postalCode: p.location?.postcode || '',
        country: country,
        // New API `location.country` is an ISO-2 code (e.g. "US"); take first
        // two chars so the trpc-router country filter still matches.
        countryCode: toAlpha2(country) || coords.countryCode || '',
        latitude: lat,
        longitude: lng,
        phone: p.tel,
        website: p.website,
        ratings: {
          foursquare: p.rating ? p.rating / 2 : undefined, // FSQ uses 10-point scale
          foursquareReviewCount: p.stats?.total_ratings,
        },
        priceRange: p.price ? '$'.repeat(p.price) : undefined,
        cuisineType: p.categories?.[0]?.name || 'Restaurant',
        categories: p.categories?.map((c: any) => c.name) || [],
        photos: p.photos?.map((ph: any) => `${ph.prefix}original${ph.suffix}`) || [],
        hours: parseFoursquareHours(p.hours),
        sources: ['foursquare'],
      };
    });
  } catch (e) {
    console.error('[Scraper] Foursquare fetch error:', e);
    return [];
  }
}

// Primary HERE categories that mark a business you can't sit down and eat at.
const HERE_NON_VENUE_PRIMARY = ['catering', 'food production', 'dancing'];

// HERE's address.label is "<title>, <street>, <city> ..." — the name is already
// shown above the address, so repeating it reads as a bug on every card.
function stripTitlePrefix(label: string, title?: string): string {
  if (!title) return label;
  const prefix = `${title}, `;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

async function fetchHERE(
  coords: GeoCoords,
  radiusMeters: number,
  apiKey: string,
  limit: number
): Promise<Partial<ScrapedRestaurant>[]> {
  if (!apiKey) return [];
  
  try {
    // HERE's /v1/discover REQUIRES a `q` param — a category-only request 400s.
    // We keep the proven free-text `q=restaurant` and rely on the non-food
    // deny-list in mergeRestaurants (isNonFoodPlace) to drop the fuzzy matches
    // it pulls in (e.g. "Action Outdoor Kitchen / Hardware, House & Garden").
    // A cleaner category-filtered alternative is the /v1/browse endpoint
    // (categories=100-1000-0000, no q) — switch to that once it's verified
    // live; the earlier discover+categories+in=circle combo was malformed.
    const url = new URL('https://discover.search.hereapi.com/v1/discover');
    url.searchParams.set('at', `${coords.lat},${coords.lng}`);
    url.searchParams.set('q', 'restaurant');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('apiKey', apiKey);

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      console.error(`[Scraper] HERE error: ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    // HERE /v1/discover only *biases* toward `at`; it has no radius, so far-off
    // matches for q=restaurant slip in. Enforce the caller's radius here.
    // Also drop places whose PRIMARY category is a non-venue food business
    // (caterers, food-production offices, restaurant-group HQs) or a dance
    // club — they carry a secondary "Restaurant" tag, so isNonFoodPlace's
    // any-category food signal keeps them, but nobody can eat there.
    const items = (data.items || []).filter((p: any) => {
      if (typeof p.distance === 'number' && p.distance > radiusMeters) return false;
      const primary = String(p.categories?.[0]?.name || '').toLowerCase();
      return !HERE_NON_VENUE_PRIMARY.some((tok) => primary.includes(tok));
    });
    return items.map((p: any) => ({
      id: `here_${p.id}`,
      name: p.title,
      address: stripTitlePrefix(p.address?.label || '', p.title),
      city: p.address?.city || coords.city || '',
      state: p.address?.state || p.address?.county || coords.state || '',
      postalCode: p.address?.postalCode || '',
      country: p.address?.countryName || coords.country || '',
      // HERE uses alpha-3 ("USA"); everything downstream compares alpha-2.
      countryCode: toAlpha2(p.address?.countryCode) || coords.countryCode || '',
      latitude: p.position?.lat || coords.lat,
      longitude: p.position?.lng || coords.lng,
      phone: p.contacts?.[0]?.phone?.[0]?.value,
      website: p.contacts?.[0]?.www?.[0]?.value,
      ratings: {
        here: p.averageRating,
        hereReviewCount: p.totalRatings,
      },
      cuisineType: p.categories?.[0]?.name || 'Restaurant',
      categories: p.categories?.map((c: any) => c.name) || [],
      // HERE provides distance in meters - convert to result
      distance: p.distance ? p.distance / 1609.34 : undefined, // Convert to miles
      hours: parseHereHours(p.openingHours),
      sources: ['here'],
    }));
  } catch (e) {
    console.error('[Scraper] HERE fetch error:', e);
    return [];
  }
}

async function fetchGooglePlaceDetails(
  placeId: string,
  apiKey: string
): Promise<{
  photos: string[];
  website?: string;
  phone?: string;
  menuUrl?: string;
  hours?: Record<string, string>;
  utcOffsetMinutes?: number;
  reviewAspects?: ReviewAspect[];
  editorialSummary?: string;
} | null> {
  try {
    // opening_hours added so the "open now" badge actually works — previously
    // the worker never requested hours and every restaurant showed "Hours unknown".
    // utc_offset_minutes lets open-now run on the RESTAURANT's clock instead
    // of the device's (wrong whenever the user searches another timezone).
    // reviews + editorial_summary feed the aspect verdicts ("Great oceanside
    // coffee"). Both are Atmosphere-tier fields, so this call bills at the
    // Atmosphere rate; it is still one call per place, as before.
    const fields = 'photos,website,formatted_phone_number,url,opening_hours,utc_offset_minutes,reviews,editorial_summary';
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const d = data.result;
    if (!d) return null;
    // Cap at 10 photo refs (CLAUDE.md Bug 1) so later /api/photo proxy
    // hits stay bounded. Place Details itself is one billed call either way.
    const photos = (d.photos || []).slice(0, 10).map((p: any) =>
      `/api/photo?ref=${encodeURIComponent(p.photo_reference)}&maxwidth=800`
    );
    const website = d.website || '';
    // Use restaurant website as menu link (most have a menu page)
    const menuUrl = website || undefined;
    const hours = parseGoogleWeekdayText(d.opening_hours?.weekday_text);
    const utcOffsetMinutes =
      typeof d.utc_offset_minutes === 'number' ? d.utc_offset_minutes : undefined;
    const reviews = Array.isArray(d.reviews)
      ? d.reviews
          .filter((r: any) => typeof r?.text === 'string' && r.text.trim())
          .map((r: any) => ({ text: r.text as string, rating: typeof r.rating === 'number' ? r.rating : undefined }))
      : [];
    const reviewAspects = reviews.length ? extractReviewAspects(reviews) : undefined;
    const editorialSummary =
      typeof d.editorial_summary?.overview === 'string' ? d.editorial_summary.overview.trim() || undefined : undefined;
    return {
      photos,
      website,
      phone: d.formatted_phone_number,
      menuUrl,
      hours,
      utcOffsetMinutes,
      reviewAspects: reviewAspects?.length ? reviewAspects : undefined,
      editorialSummary,
    };
  } catch {
    return null;
  }
}

async function fetchGoogle(
  coords: GeoCoords,
  radiusMeters: number,
  apiKey: string,
  limit: number
): Promise<Partial<ScrapedRestaurant>[]> {
  if (!apiKey || providerDown('Google')) return [];

  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${coords.lat},${coords.lng}&radius=${Math.min(radiusMeters, 50000)}&type=restaurant&key=${apiKey}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.error(`[Scraper] Google error: ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    // Google returns HTTP 200 even for REQUEST_DENIED / OVER_QUERY_LIMIT /
    // INVALID_REQUEST, with an empty results array. Without this, a billing or
    // key problem shows up only as "Google: 0" and photos silently vanish.
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(`[Scraper] Google status ${data.status}: ${String(data.error_message || '').slice(0, 160)}`);
      if (['REQUEST_DENIED', 'OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT'].includes(data.status)) {
        markProviderDown('Google', data.status);
      }
      return [];
    }
    const places = (data.results || []).slice(0, limit);

    // Fetch Place Details in parallel to get full photo sets. Capped to
    // balance "every restaurant gets its photos" against Google Places
    // billing — each detail call costs extra. Restaurants beyond this cap
    // fall back to the single search-result photo (still visible, just not
    // the full gallery). CLAUDE.md §Bug 1 explicitly calls out managing API
    // costs for this enrichment. Bumped 20→40 on 2026-05-10 so a wider
    // slice of search results has enough photos to actually find menu
    // candidates via Vision classification.
    const ENRICHMENT_CAP = 40;
    // Promise.allSettled so a single detail-call timeout doesn't collapse
    // the entire Google result set — previously one 8s timeout kills the
    // whole search via the outer try/catch.
    const detailResults = await Promise.allSettled(
      places.slice(0, ENRICHMENT_CAP).map((p: any) =>
        p.place_id ? fetchGooglePlaceDetails(p.place_id, apiKey) : Promise.resolve(null)
      )
    );
    const resolvedDetails = detailResults.map((r) =>
      r.status === "fulfilled" ? r.value : null
    );

    return places.map((p: any, i: number) => {
      const details = i < ENRICHMENT_CAP ? resolvedDetails[i] : null;
      const searchPhoto = p.photos?.[0]
        ? `/api/photo?ref=${encodeURIComponent(p.photos[0].photo_reference)}&maxwidth=800`
        : undefined;
      const photos = details?.photos?.length ? details.photos : (searchPhoto ? [searchPhoto] : []);
      return {
        // Match server-side prefix (`google_`) so the same place has the
        // same ID regardless of which backend served the request.
        id: `google_${p.place_id}`,
        name: p.name,
        address: p.vicinity || '',
        city: coords.city || '',
        state: coords.state || '',
        postalCode: '',
        country: coords.country || '',
        countryCode: coords.countryCode || '',
        latitude: p.geometry?.location?.lat || coords.lat,
        longitude: p.geometry?.location?.lng || coords.lng,
        ratings: {
          google: p.rating,
          googleReviewCount: p.user_ratings_total,
        },
        priceRange: p.price_level ? '$'.repeat(p.price_level) : undefined,
        cuisineType: formatGoogleType(
          p.types?.find((t: string) =>
            !['restaurant', 'food', 'point_of_interest', 'establishment'].includes(t)
          )
        ) || 'Restaurant',
        categories: (p.types || []).map((t: string) => formatGoogleType(t) || t),
        photos,
        website: details?.website,
        phone: details?.phone,
        menuUrl: details?.menuUrl,
        hours: details?.hours,
        utcOffsetMinutes: details?.utcOffsetMinutes,
        reviewAspects: details?.reviewAspects,
        editorialSummary: details?.editorialSummary,
        sources: ['google'],
      };
    });
  } catch (e) {
    console.error('[Scraper] Google fetch error:', e);
    return [];
  }
}


/**
 * Generate external service URLs for a restaurant
 */
function generateExternalUrls(
  name: string,
  address: string,
  city: string,
  state: string,
  country: string,
  lat: number,
  lng: number
) {
  const encodedName = encodeURIComponent(name);
  const encodedLocation = encodeURIComponent(`${city}, ${state || country}`);
  const encodedAddress = encodeURIComponent(`${name} ${address} ${city} ${state || ''} ${country}`);
  const encodedNameAddr = encodeURIComponent(`${name} ${city}`);
  
  return {
    yelpUrl: `https://www.yelp.com/search?find_desc=${encodedName}&find_loc=${encodedLocation}`,
    googleMapsUrl: `https://www.google.com/maps/search/${encodedAddress}/@${lat},${lng},15z`,
    doordashUrl: `https://www.doordash.com/search/store/${encodedNameAddr}/`,
    ubereatsUrl: `https://www.ubereats.com/search?q=${encodedName}`,
    grubhubUrl: `https://www.grubhub.com/search?queryText=${encodedName}`,
  };
}

/**
 * Haversine distance between two lat/lng points in meters.
 * Used to distinguish between two restaurants with the same normalized
 * name (chains) when merging results — same name + <100m apart is
 * almost certainly the same physical restaurant from multiple sources;
 * same name + >100m apart is two different locations of a chain.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const MERGE_DISTANCE_METERS = 100;

// Google, HERE and OSM list a Culver's as plain "Culver's" while the
// Culver's locator record is "Culver's - Madison", so they never grouped and
// the search showed a second copy of the store with no flavor and the wrong
// hours. Give every Culver's the same key and let distance tell stores apart
// (providers pin a store up to ~200 m from the locator's point).
const CULVERS_KEY = 'culvers';
const CULVERS_MERGE_DISTANCE_METERS = 250;
function mergeKey(name: string): string {
  const k = normalizeRestaurantName(name);
  return k.startsWith(CULVERS_KEY) ? CULVERS_KEY : k;
}

function mergeRestaurants(all: Partial<ScrapedRestaurant>[]): ScrapedRestaurant[] {
  // Group by normalized name AND geographic proximity. Two records with the
  // same name only merge when they're within MERGE_DISTANCE_METERS of each
  // other — otherwise they're two different locations of a chain and must
  // stay separate. Previously we grouped by name alone, which collapsed
  // every Starbucks/McDonald's/etc. in the search radius into a single
  // record with the first source's coordinates.
  const grouped: Partial<ScrapedRestaurant>[][] = [];

  for (const r of all) {
    const key = mergeKey(r.name || '');
    if (!key) continue;

    // Try to attach to an existing group with the same name AND within
    // MERGE_DISTANCE_METERS. Otherwise start a new group.
    let attached = false;
    for (const group of grouped) {
      const sameName = mergeKey(group[0].name || '') === key;
      if (!sameName) continue;

      const g0 = group[0];
      const hasCoords =
        typeof g0.latitude === 'number' &&
        typeof g0.longitude === 'number' &&
        typeof r.latitude === 'number' &&
        typeof r.longitude === 'number';

      if (hasCoords) {
        const d = haversineMeters(g0.latitude!, g0.longitude!, r.latitude!, r.longitude!);
        if (d <= (key === CULVERS_KEY ? CULVERS_MERGE_DISTANCE_METERS : MERGE_DISTANCE_METERS)) {
          group.push(r);
          attached = true;
          break;
        }
      } else {
        // No coords on at least one side — fall back to name match only.
        group.push(r);
        attached = true;
        break;
      }
    }

    if (!attached) {
      grouped.push([r]);
    }
  }
  
  const merged: ScrapedRestaurant[] = [];

  for (const records of grouped) {
    const primary = records[0];
    const allSources = [...new Set(records.flatMap(r => r.sources || []))];
    const allCategories = [...new Set(records.flatMap(r => r.categories || []))];
    const allPhotos = [...new Set(records.flatMap(r => r.photos || []))];
    
    // Aggregate ratings — review-count weighted, matching the local dev
    // server (server/restaurant-scraper.ts::mergeRestaurantRecords). A
    // source with 10,000 reviews at 4.5 stars should weigh more than a
    // source with 3 reviews at 5.0 stars. Previously this was an
    // unweighted mean that produced different scores from dev.
    const ratings: ScrapedRestaurant['ratings'] = {
      aggregated: 0,
      totalReviews: 0,
    };

    let totalWeightedRating = 0;
    let totalReviews = 0;

    for (const r of records) {
      if (r.ratings?.foursquare != null) {
        ratings.foursquare = r.ratings.foursquare;
        ratings.foursquareReviewCount = r.ratings.foursquareReviewCount || 0;
        const count = r.ratings.foursquareReviewCount || 1;
        totalWeightedRating += r.ratings.foursquare * count;
        totalReviews += count;
      }
      if (r.ratings?.here != null) {
        ratings.here = r.ratings.here;
        ratings.hereReviewCount = r.ratings.hereReviewCount || 0;
        const count = r.ratings.hereReviewCount || 1;
        totalWeightedRating += r.ratings.here * count;
        totalReviews += count;
      }
      if (r.ratings?.google != null) {
        ratings.google = r.ratings.google;
        ratings.googleReviewCount = r.ratings.googleReviewCount || 0;
        const count = r.ratings.googleReviewCount || 1;
        totalWeightedRating += r.ratings.google * count;
        totalReviews += count;
      }
    }

    // When NO source contributes a numerical rating+count (e.g. a Culver's
    // record where we hardcode aggregated=4.5 but totalReviews=0), the
    // weighted-mean formula produces 0 and the record sinks to the bottom
    // of the sort. Slice(0, limit) then drops it before the country filter.
    // Fall back to the max pre-computed `aggregated` across source records
    // so chain-API entries with a static rating still rank.
    if (totalReviews > 0) {
      ratings.aggregated = Math.round((totalWeightedRating / totalReviews) * 10) / 10;
    } else {
      const fallback = records
        .map((r) => r.ratings?.aggregated ?? 0)
        .reduce((a, b) => Math.max(a, b), 0);
      ratings.aggregated = fallback;
    }
    ratings.totalReviews = totalReviews;
    
    // Generate sentiment from ratings
    const sentiment = inferSentimentFromMetadata(
      allCategories,
      ratings.aggregated,
      ratings.totalReviews
    );

    // Review-text verdicts beat rating-derived tags: they say WHY people go.
    // Feeding them into highlights/warnings also puts them in the embedding
    // text, so semantic search for "quiet coffee by the ocean" can hit.
    const reviewAspects = records.find((r) => r.reviewAspects?.length)?.reviewAspects;
    const editorialSummary = records.find((r) => r.editorialSummary)?.editorialSummary;
    if (reviewAspects?.length) {
      const praised = reviewAspects.filter((a) => a.verdict !== 'bad').map((a) => a.label);
      const panned = reviewAspects.filter((a) => a.verdict === 'bad').map((a) => a.label);
      if (praised.length) sentiment.highlights = praised;
      if (panned.length) sentiment.warnings = panned;
    }

    // Build enhanced review summary
    const cuisineDesc = primary.cuisineType?.toLowerCase() || 'restaurant';
    const locationDesc = primary.city || 'the area';
    let reviewSummary = editorialSummary
      ? `${editorialSummary.replace(/\.?$/, '.')}`
      : `${primary.name} is a ${cuisineDesc} in ${locationDesc}.`;
    if (sentiment.summary) {
      reviewSummary += ` ${sentiment.summary}`;
    }
    const topAspects = (reviewAspects || []).filter((a) => a.verdict !== 'bad').slice(0, 3);
    if (topAspects.length) {
      reviewSummary += ` Reviewers say: ${topAspects.map((a) => a.label.toLowerCase()).join('; ')}.`;
    }
    
    // Get address info for URL generation
    const address = records.find(r => r.address)?.address || '';
    const city = records.find(r => r.city)?.city || '';
    const state = records.find(r => r.state)?.state || '';
    const country = records.find(r => r.country)?.country || '';
    const countryCode = records.find(r => r.countryCode)?.countryCode || '';
    const postalCode = records.find(r => r.postalCode)?.postalCode || '';
    const lat = primary.latitude || 0;
    const lng = primary.longitude || 0;
    
    // Generate external URLs
    const externalUrls = generateExternalUrls(
      primary.name || 'Unknown',
      address,
      city,
      state,
      country,
      lat,
      lng
    );
    
    // Culver's-specific fields (isCulvers / flavorOfTheDay / flavorDescription)
    // were previously dropped by the merge — when the Culver's-source
    // record landed in the same name+location group as a Google Places
    // entry, the merged record kept only the Google identity and the
    // app's `restaurant.isCulvers && restaurant.flavorOfTheDay` gate
    // never fired. Promote any Culver's record in the group to primary
    // so id stays as `culvers_*` (matches the app's `isCulvers` branch)
    // and propagate the flavor fields. Mirrors the working behavior in
    // server/restaurant-scraper.ts mergeRestaurantRecords.
    const culversRecord = records.find((r) => r.isCulvers);
    const effectivePrimary = culversRecord ?? primary;
    const finalId =
      effectivePrimary.id ||
      `merged_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const finalName = effectivePrimary.name || 'Unknown';
    const finalCuisine = inferCuisine(finalName, allCategories, effectivePrimary.cuisineType);

    merged.push({
      id: finalId,
      name: finalName,
      address,
      city,
      state,
      postalCode,
      zipCode: postalCode, // Legacy alias
      country,
      countryCode,
      latitude: lat,
      longitude: lng,
      phone: records.find(r => r.phone)?.phone,
      website: records.find(r => r.website)?.website,
      ratings,
      priceRange: records.find(r => r.priceRange)?.priceRange,
      cuisineType: finalCuisine,
      categories: allCategories,
      photos: allPhotos.slice(0, 20),
      // The Culver's locator's hours are the store's own; other providers'
      // copies are often stale.
      hours: (culversRecord?.hours && Object.keys(culversRecord.hours).length > 0)
        ? culversRecord.hours
        : records.find(r => r.hours && Object.keys(r.hours).length > 0)?.hours,
      // Dropped here before, so the app never got Google's offset and
      // checked "open now" against the phone's clock.
      utcOffsetMinutes: (culversRecord ?? records.find(r => typeof r.utcOffsetMinutes === 'number'))?.utcOffsetMinutes,
      menuUrl: records.find(r => r.menuUrl)?.menuUrl,
      isCulvers: records.some(r => r.isCulvers) || undefined,
      flavorOfTheDay: records.find(r => r.flavorOfTheDay)?.flavorOfTheDay,
      flavorDescription: records.find(r => r.flavorDescription)?.flavorDescription,
      flavorDate: records.find(r => r.flavorDate)?.flavorDate,
      reviewSummary,
      sentiment,
      reviewAspects,
      editorialSummary,
      yelpUrl: externalUrls.yelpUrl,
      googleMapsUrl: externalUrls.googleMapsUrl,
      doordashUrl: externalUrls.doordashUrl,
      ubereatsUrl: externalUrls.ubereatsUrl,
      grubhubUrl: externalUrls.grubhubUrl,
      scrapedAt: new Date().toISOString(),
      sources: allSources,
    });
  }
  
  // Drop non-food contamination (hardware stores, salons, etc.) that a fuzzy
  // provider search may have injected, then sort by aggregated rating.
  return merged
    .filter((r) => !isNonFoodPlace(r.categories, r.cuisineType))
    .sort((a, b) => b.ratings.aggregated - a.ratings.aggregated);
}

// =============================================================================
// OpenStreetMap (Overpass) — keyless fallback
// =============================================================================

function formatOsmCuisine(cuisine?: string): string {
  if (!cuisine) return 'Restaurant';
  const first = cuisine.split(';')[0].trim();
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/_/g, ' ');
}

// Google Places `types` come back as machine tokens — "fast_food",
// "meal_takeaway", "liquor_store". Render them as human strings ("Fast
// Food", "Meal Takeaway") before storing on the restaurant record so
// the UI doesn't surface raw underscored tokens to users.
function formatGoogleType(t?: string): string | undefined {
  if (!t) return undefined;
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Unambiguous non-food category tokens. A real restaurant's category list
// never contains these — the ENTITY they describe (a mall, a members' club, a
// stadium) is not a dining venue, and any restaurant it contains carries its
// own 'restaurant'/cuisine category from the provider. Any record carrying one
// of these is contamination — most often from a provider's fuzzy text match
// (see fetchHERE) — and gets dropped before it can reach the spinner reel.
// Defense-in-depth: even after the HERE query was category-constrained, cached
// records and other providers can still surface a non-food place, and this
// catches them at merge time.
const NON_FOOD_CATEGORY_TOKENS = [
  'hardware', 'house & garden', 'home & garden', 'home improvement',
  'furniture', 'clothing', 'apparel', 'shoe', 'jewelry', 'department store',
  'grocery', 'supermarket', 'convenience store', 'liquor store', 'pharmacy',
  'drugstore', 'gas station', 'petrol', 'fuel', 'automotive', 'car repair',
  'car dealer', 'hotel', 'motel', 'lodging', 'hospital', 'clinic', 'dentist',
  'bank', 'atm', 'hair salon', 'beauty salon', 'nail salon', 'barber', 'spa',
  'gym', 'fitness', 'school', 'university', 'church', 'government', 'library',
  'gallery', 'museum', 'storage', 'real estate',
  // Added 2026-07-10: malls, members' clubs, and attractions were leaking into
  // 90210 results — "The Grove" (Shopping Mall) and "Soho House West
  // Hollywood" (Organizations And Societies) showed up in the spinner and
  // Browse list. These entity types are never a restaurant; a restaurant
  // inside them is separately tagged by the provider.
  'shopping mall', 'shopping_mall', 'shopping center', 'shopping centre',
  'outlet mall', 'tourist attraction', 'tourist_attraction', 'landmark',
  'organization', 'organisation', 'societ', 'stadium', 'arena',
  'convention center', 'convention centre', 'amusement park', 'theme park',
  'movie theater', 'movie theatre', 'cinema', 'casino', 'night club',
  'nightclub', 'zoo', 'aquarium', 'park & ride',
];

// Ultra-generic "container" tokens that providers attach to EVERY place —
// including real restaurants — so they can't trigger an unconditional drop.
// They only mark a place as non-food when it also lacks any positive food
// signal (i.e. Google returned nothing but point_of_interest/establishment).
const GENERIC_PLACE_TOKENS = ['point of interest', 'point_of_interest', 'establishment'];

// Positive food/dining signals. Used to keep a place that carries a generic
// container token but is genuinely a dining venue, and to rescue a mall/hotel
// entry that ALSO happens to be tagged as a restaurant (a food hall).
const FOOD_SIGNAL_TOKENS = [
  'restaurant', 'cafe', 'café', 'coffee', 'bakery', 'bakeri', 'pizzeria',
  'pizza', 'bar & grill', 'bar and grill', 'gastropub', 'brewpub', 'brewery',
  'taproom', 'pub', 'tavern', 'grill', 'diner', 'bistro', 'brasserie',
  'trattoria', 'ristorante', 'steakhouse', 'bbq', 'barbecue', 'barbeque',
  'deli', 'delicatessen', 'sandwich', 'burger', 'sushi', 'ramen', 'noodle',
  'taco', 'taqueria', 'cantina', 'kitchen', 'eatery', 'buffet', 'food',
  'meal takeaway', 'meal delivery', 'ice cream', 'gelato', 'dessert', 'donut',
  'doughnut', 'bagel', 'creperie', 'patisserie', 'juice', 'smoothie',
  'teahouse', 'dining', 'snack', 'seafood', 'chophouse', 'wings', 'noodles',
  // cuisines only appear on food places
  'italian', 'mexican', 'chinese', 'japanese', 'thai', 'indian', 'korean',
  'vietnamese', 'mediterranean', 'greek', 'french', 'american', 'vegan',
  'vegetarian', 'asian', 'caribbean', 'latin', 'tapas', 'lebanese', 'turkish',
  'middle eastern', 'halal', 'kosher', 'cajun', 'creole', 'peruvian', 'cuban',
  'brazilian', 'ethiopian', 'soul food', 'spanish', 'filipino', 'hawaiian',
];

function hasFoodSignal(haystack: string[]): boolean {
  return haystack.some((c) => FOOD_SIGNAL_TOKENS.some((tok) => c.includes(tok)));
}

export function isNonFoodPlace(categories: string[] = [], cuisineType?: string): boolean {
  const haystack = [...categories, cuisineType || ''].map((c) => (c || '').toLowerCase());
  // 1. Hard non-food entity types → always drop.
  if (haystack.some((c) => NON_FOOD_CATEGORY_TOKENS.some((tok) => c.includes(tok)))) {
    return true;
  }
  // 2. Only generic container types (point_of_interest / establishment) with no
  //    positive food signal → drop. Real restaurants always carry a food
  //    signal alongside these, so they are never caught here.
  const genericOnly = haystack.some((c) => GENERIC_PLACE_TOKENS.some((tok) => c.includes(tok)));
  if (genericOnly && !hasFoodSignal(haystack)) {
    return true;
  }
  return false;
}

// Provider categories are unreliable for the user-facing cuisine label —
// Foursquare buckets a sushi bar as "Fast Food" and a diner as "Bakery", and
// the merge used to display categories[0] verbatim. Prefer a specific cuisine
// found in the category list; if none, infer one from distinctive tokens in
// the restaurant's name; otherwise fall back to the first non-generic category.
const CUISINE_KEYWORDS: Array<[RegExp, string]> = [
  [/sushi|japanese|ramen|izakaya|teriyaki|hibachi/i, 'Japanese'],
  [/pizz|pizzeria/i, 'Pizza'],
  [/taqueri|taco|mexican|burrito|cantina|tequil/i, 'Mexican'],
  [/\bthai\b/i, 'Thai'],
  [/chinese|szechuan|sichuan|dim sum|\bwok\b|mandarin/i, 'Chinese'],
  [/indian|curry|tandoor|masala|biryani/i, 'Indian'],
  [/jamaican|caribbean|jerk\b/i, 'Caribbean'],
  [/vietnam|\bpho\b|banh mi/i, 'Vietnamese'],
  [/korean|bulgogi|bibimbap/i, 'Korean'],
  [/mediterran|greek|gyro|falafel|kebab|shawarma|hummus/i, 'Mediterranean'],
  [/italian|trattoria|ristorante|\bpasta\b/i, 'Italian'],
  [/french|brasserie|creperie|crêperie/i, 'French'],
  [/steakhouse|chophouse|\bsteak\b/i, 'Steakhouse'],
  [/seafood|oyster|\bcrab\b|lobster|fish fry|fish & chips/i, 'Seafood'],
  [/\bbbq\b|barbecue|barbeque|smokehouse/i, 'Barbecue'],
  [/burger/i, 'Burgers'],
  [/diner|blue plate/i, 'Diner'],
  [/bakery|bakeri|patisserie|pâtisserie|\bpastr/i, 'Bakery'],
  [/delicatessen|\bdeli\b|sandwich/i, 'Deli'],
  [/coffee|\bcafe\b|café|espresso|\bjava|roaster/i, 'Cafe'],
  [/brewery|brewpub|brewing|taproom|alehouse|freehouse|\bpub\b/i, 'Brewpub'],
  [/vegan|vegetarian|plant.based/i, 'Vegetarian'],
  [/\basian\b/i, 'Asian'],
];

const GENERIC_CUISINE_CATEGORIES = new Set([
  'restaurant', 'restaurants', 'food', 'fast food', 'fast food restaurant',
  'meal takeaway', 'meal delivery', 'bar', 'point of interest', 'establishment',
  'casual dining', 'fine dining', 'dining', 'eatery', 'food & drink',
  // Google's generic `store`/`food` types bleed through as a "cuisine" for
  // chains like Culver's ("Store"). Treat them as non-cuisines so inferCuisine
  // falls through to a real label instead of surfacing "Store" to the user.
  'store', 'food court', 'general',
]);

export function inferCuisine(name: string, categories: string[] = [], fallback?: string): string {
  // 1. A specific (non-generic) provider category that maps to a known cuisine.
  for (const cat of categories) {
    const c = (cat || '').toLowerCase();
    if (GENERIC_CUISINE_CATEGORIES.has(c)) continue;
    for (const [re, label] of CUISINE_KEYWORDS) {
      if (re.test(c)) return label;
    }
  }
  // 2. Infer from distinctive tokens in the restaurant name.
  for (const [re, label] of CUISINE_KEYWORDS) {
    if (re.test(name)) return label;
  }
  // 3. First non-generic provider category, else the fallback — but only if
  // the fallback isn't itself a generic bucket. Otherwise a primary cuisineType
  // of "Store"/"Fast Food" would leak straight through (Google-sourced Culver's
  // came in as "Store" with no other signal).
  const specific = categories.find((c) => c && !GENERIC_CUISINE_CATEGORIES.has(c.toLowerCase()));
  if (specific) return specific;
  if (fallback && !GENERIC_CUISINE_CATEGORIES.has(fallback.toLowerCase())) return fallback;
  return 'Restaurant';
}

function parseOsmHours(hoursString?: string): Record<string, string> | undefined {
  if (!hoursString) return undefined;
  const out: Record<string, string> = {};
  const dayMap: Record<string, string> = {
    Mo: 'monday', Tu: 'tuesday', We: 'wednesday',
    Th: 'thursday', Fr: 'friday', Sa: 'saturday', Su: 'sunday',
  };
  try {
    for (const part of hoursString.split(';')) {
      const m = part.trim().match(/^([A-Za-z,-]+)\s+(.+)$/);
      if (!m) continue;
      const [, days, time] = m;
      const range = days.match(/(\w{2})-(\w{2})/);
      if (range) {
        const keys = Object.keys(dayMap);
        const a = keys.indexOf(range[1]);
        const b = keys.indexOf(range[2]);
        if (a !== -1 && b !== -1) {
          for (let i = a; i <= b; i++) out[dayMap[keys[i]]] = time;
        }
      } else {
        const day = dayMap[days.substring(0, 2)];
        if (day) out[day] = time;
      }
    }
  } catch {
    return undefined;
  }
  return Object.keys(out).length ? out : undefined;
}

async function fetchOpenStreetMap(
  coords: GeoCoords,
  radiusMeters: number,
  cuisineType: string | undefined,
  limit: number
): Promise<Partial<ScrapedRestaurant>[]> {
  try {
    // Overpass QL — node + way coverage for restaurants, fast_food, and
    // cafes that have a cuisine tag (filtering generic coffee shops out).
    // Sanitize before interpolating into Overpass QL — keep only letters,
    // digits, space, underscore and hyphen so a crafted cuisineType can't break
    // out of the regex literal and inject extra (expensive) query clauses.
    const safeCuisine = cuisineType?.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const cuisineFilter = safeCuisine ? `["cuisine"~"${safeCuisine}",i]` : '';
    const query = `[out:json][timeout:20];(node["amenity"="restaurant"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});node["amenity"="fast_food"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});node["amenity"="cafe"]["cuisine"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});way["amenity"="restaurant"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});way["amenity"="fast_food"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng}););out center ${limit};`;

    const init: RequestInit = {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'FoodieFinder/2.0 (contact@sassyconsultingllc.com)',
      },
    };
    // overpass-api.de regularly sheds load with 429/5xx (a 521 knocked OSM out
    // of a live search on 2026-11-09). Fall back to one public mirror on an
    // HTTP error. A timeout is not retried, to keep worst-case latency bounded.
    let response = await fetchWithTimeout(OVERPASS_ENDPOINTS[0], init, 20_000);
    if (!response.ok) {
      console.warn(`[Scraper] Overpass status ${response.status}; trying mirror`);
      response = await fetchWithTimeout(OVERPASS_ENDPOINTS[1], init, 15_000);
    }
    if (!response.ok) {
      console.warn(`[Scraper] Overpass mirror status ${response.status}`);
      return [];
    }
    const data: any = await response.json();
    const elements: any[] = data?.elements || [];

    return elements.map((el) => {
      const tags = el.tags || {};
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const addressParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
      const externalUrls = generateExternalUrls(
        tags.name || 'Unknown',
        addressParts.join(' ') || '',
        tags['addr:city'] || '',
        tags['addr:state'] || '',
        tags['addr:country'] || '',
        lat ?? 0,
        lng ?? 0
      );
      return {
        id: `osm_${el.type}_${el.id}`,
        name: tags.name || 'Unknown Restaurant',
        address: addressParts.join(' ') || tags['addr:full'] || '',
        city: tags['addr:city'] || '',
        state: tags['addr:state'] || '',
        zipCode: tags['addr:postcode'] || '',
        postalCode: tags['addr:postcode'] || '',
        latitude: lat,
        longitude: lng,
        phone: tags.phone || tags['contact:phone'],
        website: tags.website || tags['contact:website'],
        priceRange: tags.price_range,
        cuisineType:
          formatOsmCuisine(tags.cuisine) ||
          (tags.amenity === 'fast_food' ? 'Fast Food' : 'Restaurant'),
        categories: tags.cuisine ? tags.cuisine.split(';').map((c: string) => c.trim()) : [],
        hours: parseOsmHours(tags.opening_hours),
        ratings: { aggregated: 0, totalReviews: 0 },
        sources: ['openstreetmap'],
        yelpUrl: externalUrls.yelpUrl,
        googleMapsUrl: externalUrls.googleMapsUrl,
        doordashUrl: externalUrls.doordashUrl,
        ubereatsUrl: externalUrls.ubereatsUrl,
        grubhubUrl: externalUrls.grubhubUrl,
        scrapedAt: new Date().toISOString(),
      } as Partial<ScrapedRestaurant>;
    });
  } catch (e) {
    console.warn('[Scraper] OpenStreetMap error:', e);
    return [];
  }
}

// =============================================================================
// Culver's locations — keyless US-only fallback
// =============================================================================

/**
 * The parts of a Culver's locator record that change: hours, offset and
 * today's flavor. Used for new scrapes and to refresh cached records.
 */
function culversStoreState(meta: any) {
  // utcOffset is whole hours at the store, already adjusted for DST.
  const utcOffsetMinutes = typeof meta.utcOffset === 'number' ? Math.round(meta.utcOffset * 60) : undefined;
  let hours = normalizeHours(meta.dineInHours) ?? normalizeHours(meta.driveThruHours);
  if (meta.isTemporarilyClosed) {
    hours = Object.fromEntries(
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, 'Closed'])
    );
  }
  return {
    hours,
    utcOffsetMinutes,
    flavorOfTheDay: meta.flavorOfDayName || undefined,
    flavorDescription: meta.flavorOfTheDayDescription || undefined,
    flavorDate: storeLocalDate(utcOffsetMinutes),
  };
}

/** Today's date at a store with this UTC offset (US Central if unknown). */
function storeLocalDate(utcOffsetMinutes?: number): string {
  const offset = typeof utcOffsetMinutes === 'number' ? utcOffsetMinutes : -360;
  return new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10);
}

/**
 * Flavor of the Day changes at midnight, but search results are cached for
 * 24 h, so a cached Culver's showed yesterday's flavor (or none, for records
 * cached before the flavor existed). Re-read stale Culver's records from the
 * locator, which is free, and patch flavor, hours and offset in place.
 * Returns true when anything changed. Never throws.
 */
export async function refreshCulversRecords(restaurants: any[]): Promise<boolean> {
  const stale = restaurants.filter(
    (r) => r?.isCulvers && typeof r.id === 'string' && r.id.startsWith('culvers_') &&
      r.flavorDate !== storeLocalDate(r.utcOffsetMinutes)
  );
  if (stale.length === 0) return false;
  try {
    const lat = stale.reduce((a, r) => a + (r.latitude || 0), 0) / stale.length;
    const lng = stale.reduce((a, r) => a + (r.longitude || 0), 0) / stale.length;
    const url = `https://www.culvers.com/api/locator/getLocations?lat=${lat}&long=${lng}&limit=${Math.min(Math.max(stale.length + 5, 10), 25)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return false;
    const data: any = await res.json();
    const byId = new Map<string, any>(
      (data?.data?.geofences || []).map((g: any) => [`culvers_${g._id}`, g.metadata || {}])
    );
    let changed = false;
    for (const r of stale) {
      const meta = byId.get(r.id);
      if (!meta) continue;
      Object.assign(r, culversStoreState(meta));
      changed = true;
    }
    return changed;
  } catch (e) {
    console.warn("[Scraper] Culver's refresh failed:", e);
    return false;
  }
}

async function fetchCulversLocations(
  coords: GeoCoords,
  limit: number = 10
): Promise<Partial<ScrapedRestaurant>[]> {
  try {
    const url = `https://www.culvers.com/api/locator/getLocations?lat=${coords.lat}&long=${coords.lng}&limit=${limit}`;
    const response = await fetchWithTimeout(url, {}, 8000);
    if (!response.ok) {
      console.warn(`[Scraper] Culver's status ${response.status}`);
      return [];
    }
    const data: any = await response.json();
    if (!data.isSuccessful || !data.data?.geofences) return [];

    return data.data.geofences.map((loc: any) => {
      const meta = loc.metadata || {};
      const lat = loc.geometryCenter?.coordinates?.[1] ?? coords.lat;
      const lng = loc.geometryCenter?.coordinates?.[0] ?? coords.lng;
      // Culver's locator `description` is a store label ("McFarland, WI -
      // Farwell St"), NOT the brand. Using it verbatim made the reel show
      // location strings instead of "Culver's". Use the brand (city-suffixed
      // so multiple nearby stores stay distinguishable) and keep the street
      // in `address`. The merge dedups by name+proximity, so the city suffix
      // also prevents two different-city Culver's from collapsing together.
      const brandName = meta.city ? `Culver's - ${meta.city}` : "Culver's";
      const externalUrls = generateExternalUrls(
        brandName,
        meta.street || '',
        meta.city || '',
        meta.state || '',
        meta.country || 'US',
        lat,
        lng
      );
      return {
        id: `culvers_${loc._id}`,
        name: brandName,
        address: meta.street || '',
        city: meta.city || '',
        state: meta.state || '',
        zipCode: meta.postalCode || '',
        postalCode: meta.postalCode || '',
        // Culver's is US-only. Without these fields the trpc-router's
        // country filter ([Router] Filtering results to country US)
        // drops every Culver's record because countryCode is undefined.
        // Reproduced live 2026-05-10: worker log shows `Culver's: 10`
        // scraped, then country filter trims to zero in final response.
        country: 'United States',
        countryCode: 'US',
        latitude: lat,
        longitude: lng,
        phone: meta.phone,
        website: 'https://www.culvers.com',
        ratings: { aggregated: 4.5, totalReviews: 0 },
        priceRange: '$',
        cuisineType: 'Fast Food',
        categories: ['Fast Food', 'Burgers', 'Ice Cream'],
        ...culversStoreState(meta),
        isCulvers: true,
        sources: ['culvers'],
        yelpUrl: externalUrls.yelpUrl,
        googleMapsUrl: externalUrls.googleMapsUrl,
        doordashUrl: externalUrls.doordashUrl,
        ubereatsUrl: externalUrls.ubereatsUrl,
        grubhubUrl: externalUrls.grubhubUrl,
        scrapedAt: new Date().toISOString(),
      } as Partial<ScrapedRestaurant>;
    });
  } catch (e) {
    console.warn('[Scraper] Culver\'s error:', e);
    return [];
  }
}

export async function scrapeRestaurants(opts: ScrapeOptions): Promise<ScrapedRestaurant[]> {
  const {
    postalCode,
    countryCode,
    radius,
    radiusUnit = 'miles',
    cuisineType,
    limit,
    foursquareKey,
    hereKey,
    googleKey,
  } = opts;

  console.log(`[Scraper] Fetching for ${postalCode}${countryCode ? ` (${countryCode})` : ''}, radius ${radius} ${radiusUnit}`);

  const coords = await getCoords(postalCode, countryCode);

  // Check if geocoding failed
  if (coords.lat === 0 && coords.lng === 0) {
    console.error(`[Scraper] Failed to geocode postal code: ${postalCode}`);
    return [];
  }

  const radiusMeters = toMeters(radius, radiusUnit);

  // Always include OSM + Culver's so empty paid-API keys don't return zero.
  // Culver's is US-only and skipped automatically when countryCode != "US"
  // (or when none was supplied for a non-5-digit zip).
  const looksLikeUS =
    countryCode?.toUpperCase() === 'US' ||
    (!countryCode && /^\d{5}$/.test(postalCode));

  const [fsq, here, goog, osm, culv] = await Promise.allSettled([
    fetchFoursquare(coords, radiusMeters, foursquareKey, limit),
    fetchHERE(coords, radiusMeters, hereKey, limit),
    fetchGoogle(coords, radiusMeters, googleKey, limit),
    fetchOpenStreetMap(coords, radiusMeters, cuisineType, limit),
    looksLikeUS
      ? fetchCulversLocations(coords, 10)
      : Promise.resolve([] as Partial<ScrapedRestaurant>[]),
  ]);

  const all: Partial<ScrapedRestaurant>[] = [];

  if (fsq.status === 'fulfilled') {
    console.log(`[Scraper] Foursquare: ${fsq.value.length}`);
    all.push(...fsq.value);
  }
  if (here.status === 'fulfilled') {
    console.log(`[Scraper] HERE: ${here.value.length}`);
    all.push(...here.value);
  }
  if (goog.status === 'fulfilled') {
    console.log(`[Scraper] Google: ${goog.value.length}`);
    all.push(...goog.value);
  }
  if (osm.status === 'fulfilled') {
    console.log(`[Scraper] OpenStreetMap: ${osm.value.length}`);
    all.push(...osm.value);
  }
  if (culv.status === 'fulfilled') {
    console.log(`[Scraper] Culver's: ${culv.value.length}`);
    all.push(...culv.value);
  }

  // Providers with thin coverage (HERE in Korea and China) answer with
  // fuzzy matches from other continents; Seoul got Copenhagen. Keep only
  // places inside the search radius, with some slack for providers that
  // measure from a slightly different point.
  const maxMeters = Math.max(radiusMeters * 1.5, radiusMeters + 2000);
  const nearby = all.filter((r) =>
    typeof r.latitude !== 'number' || typeof r.longitude !== 'number' ||
    haversineMeters(coords.lat, coords.lng, r.latitude, r.longitude) <= maxMeters
  );
  if (nearby.length < all.length) {
    console.log(`[Scraper] Dropped ${all.length - nearby.length} results outside ${maxMeters} m`);
  }

  const merged = mergeRestaurants(nearby);
  console.log(`[Scraper] Merged: ${merged.length} restaurants`);

  return merged.slice(0, limit);
}

/**
 * Fetch Culver's Flavor of the Day (US-only feature).
 * Return shape mirrors server/restaurant-scraper.ts::fetchCulversFlavorOfTheDay
 * so the CulversFlavorCalendar/Widget components work identically in both
 * local dev and production.
 */
export async function fetchCulversFlavor(postalCode: string): Promise<{
  flavor: string;
  description: string;
  locationName?: string;
  address?: string;
  imageUrl?: string;
  nearbyLocations?: Array<{
    name: string;
    flavor: string;
    description: string;
    address: string;
  }>;
} | null> {
  try {
    // Culver's is US-only, so we can use US geocoding
    const coords = await getCoords(postalCode, 'US');

    if (coords.lat === 0 && coords.lng === 0) {
      return null;
    }

    // Fetch up to 5 so we can populate nearbyLocations
    const url = `https://www.culvers.com/api/locator/getLocations?lat=${coords.lat}&long=${coords.lng}&radius=25&limit=5`;

    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'FoodieFinder/2.0' },
    });

    if (!res.ok) return null;

    const data = await res.json() as any;
    // Culver's locator returns `data.data.geofences[]` with flavor info under
    // each geofence's `metadata` — NOT a top-level `locations[]` with a
    // `flavorOfTheDay` object. The old shape silently yielded zero flavors, so
    // Flavor of the Day always came back null. Mirror fetchCulversLocations().
    if (!data?.isSuccessful || !Array.isArray(data?.data?.geofences)) return null;
    const geofences = data.data.geofences as any[];

    const toFlavor = (loc: any) => {
      const meta = loc?.metadata || {};
      return {
        name: meta.city ? `Culver's - ${meta.city}` : "Culver's",
        flavor: meta.flavorOfDayName || '',
        description: meta.flavorOfTheDayDescription || '',
        address: [meta.street, meta.city, meta.state].filter(Boolean).join(', '),
        imageUrl: meta.flavorOfDaySlug
          ? `https://www.culvers.com/images/fotd/${meta.flavorOfDaySlug}`
          : undefined,
      };
    };

    const withFlavor = geofences.filter((l) => l?.metadata?.flavorOfDayName);
    if (withFlavor.length === 0) return null;
    const primary = toFlavor(withFlavor[0]);

    const nearby = withFlavor.slice(1, 5).map((l) => {
      const f = toFlavor(l);
      return { name: f.name, flavor: f.flavor, description: f.description, address: f.address };
    });

    return {
      flavor: primary.flavor,
      description: primary.description,
      locationName: primary.name,
      address: primary.address,
      imageUrl: primary.imageUrl,
      nearbyLocations: nearby.length > 0 ? nearby : undefined,
    };
  } catch (e) {
    console.error('[Scraper] Culver\'s fetch error:', e);
    return null;
  }
}

// Legacy export for backward compatibility
export type { ScrapeOptions as LegacyScrapeOptions };
