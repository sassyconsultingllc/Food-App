/**
 * Restaurant Scraper for Cloudflare Workers - INTERNATIONAL
 * Â© 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Fetches restaurant data from multiple APIs worldwide.
 * No country restrictions - works globally.
 */

import { inferSentimentFromMetadata, SentimentResult } from "./sentiment";

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
  photos?: string[];
  isCulvers?: boolean;
  flavorOfTheDay?: string;
  reviewSummary: string;
  sentiment?: SentimentResult;
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

// In-memory geocode cache for the worker
const geocodeCache = new Map<string, GeoCoords>();

/**
 * Geocode a postal code to coordinates - INTERNATIONAL
 * Uses Nominatim (OpenStreetMap) - no country restriction
 */
export async function getCoords(postalCode: string, countryCode?: string): Promise<GeoCoords> {
  const cacheKey = countryCode ? `${postalCode}:${countryCode}` : postalCode;
  
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }
  
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

      const r = await fetch(u.toString(), {
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

      geocodeCache.set(cacheKey, coords);
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
  if (!apiKey) return [];
  
  try {
    const url = new URL('https://api.foursquare.com/v3/places/search');
    url.searchParams.set('ll', `${coords.lat},${coords.lng}`);
    url.searchParams.set('radius', String(Math.min(radiusMeters, 50000))); // Max 50km
    url.searchParams.set('categories', '13065'); // Restaurants
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('fields', 'fsq_id,name,location,categories,rating,stats,price,hours,tel,website,photos');

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey, Accept: 'application/json' },
    });

    if (!res.ok) {
      console.error(`[Scraper] Foursquare error: ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    return (data.results || []).map((p: any) => ({
      id: `fsq_${p.fsq_id}`,
      name: p.name,
      address: p.location?.formatted_address || p.location?.address || '',
      city: p.location?.locality || coords.city || '',
      state: p.location?.region || coords.state || '',
      postalCode: p.location?.postcode || '',
      country: p.location?.country || coords.country || '',
      countryCode: p.location?.country_code?.toUpperCase() || coords.countryCode || '',
      latitude: p.geocodes?.main?.latitude || coords.lat,
      longitude: p.geocodes?.main?.longitude || coords.lng,
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
      sources: ['foursquare'],
    }));
  } catch (e) {
    console.error('[Scraper] Foursquare fetch error:', e);
    return [];
  }
}

async function fetchHERE(
  coords: GeoCoords,
  radiusMeters: number,
  apiKey: string,
  limit: number
): Promise<Partial<ScrapedRestaurant>[]> {
  if (!apiKey) return [];
  
  try {
    const url = new URL('https://discover.search.hereapi.com/v1/discover');
    url.searchParams.set('at', `${coords.lat},${coords.lng}`);
    url.searchParams.set('q', 'restaurant');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('apiKey', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[Scraper] HERE error: ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    return (data.items || []).map((p: any) => ({
      id: `here_${p.id}`,
      name: p.title,
      address: p.address?.label || '',
      city: p.address?.city || coords.city || '',
      state: p.address?.state || p.address?.county || coords.state || '',
      postalCode: p.address?.postalCode || '',
      country: p.address?.countryName || coords.country || '',
      countryCode: p.address?.countryCode?.toUpperCase() || coords.countryCode || '',
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
): Promise<{ photos: string[]; website?: string; phone?: string; menuUrl?: string } | null> {
  try {
    const fields = 'photos,website,formatted_phone_number,url';
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const d = data.result;
    if (!d) return null;
    const photos = (d.photos || []).slice(0, 20).map((p: any) =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${p.photo_reference}&key=${apiKey}`
    );
    const website = d.website || '';
    // Use restaurant website as menu link (most have a menu page)
    const menuUrl = website || undefined;
    return { photos, website, phone: d.formatted_phone_number, menuUrl };
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
  if (!apiKey) return [];

  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${coords.lat},${coords.lng}&radius=${Math.min(radiusMeters, 50000)}&type=restaurant&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[Scraper] Google error: ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    const places = (data.results || []).slice(0, limit);

    // Fetch Place Details in parallel to get full photo sets. Capped at 20
    // to balance "every restaurant gets its photos" against Google Places
    // billing — each detail call costs extra. Restaurants beyond this cap
    // fall back to the single search-result photo (still visible, just not
    // the full gallery). CLAUDE.md §Bug 1 explicitly calls out managing API
    // costs for this enrichment.
    const ENRICHMENT_CAP = 20;
    const detailResults = await Promise.all(
      places.slice(0, ENRICHMENT_CAP).map((p: any) =>
        p.place_id ? fetchGooglePlaceDetails(p.place_id, apiKey) : Promise.resolve(null)
      )
    );

    return places.map((p: any, i: number) => {
      const details = i < ENRICHMENT_CAP ? detailResults[i] : null;
      const searchPhoto = p.photos?.[0]
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${p.photos[0].photo_reference}&key=${apiKey}`
        : undefined;
      const photos = details?.photos?.length ? details.photos : (searchPhoto ? [searchPhoto] : []);
      return {
        id: `goog_${p.place_id}`,
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
        cuisineType: p.types?.find((t: string) =>
          !['restaurant', 'food', 'point_of_interest', 'establishment'].includes(t)
        ) || 'Restaurant',
        categories: p.types || [],
        photos,
        website: details?.website,
        phone: details?.phone,
        menuUrl: details?.menuUrl,
        sources: ['google'],
      };
    });
  } catch (e) {
    console.error('[Scraper] Google fetch error:', e);
    return [];
  }
}

function normalizeRestaurantName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
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

function mergeRestaurants(all: Partial<ScrapedRestaurant>[]): ScrapedRestaurant[] {
  const grouped = new Map<string, Partial<ScrapedRestaurant>[]>();
  
  for (const r of all) {
    const key = normalizeRestaurantName(r.name || '');
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  
  const merged: ScrapedRestaurant[] = [];
  
  for (const records of grouped.values()) {
    const primary = records[0];
    const allSources = [...new Set(records.flatMap(r => r.sources || []))];
    const allCategories = [...new Set(records.flatMap(r => r.categories || []))];
    const allPhotos = [...new Set(records.flatMap(r => r.photos || []))];
    
    // Aggregate ratings
    const ratings: ScrapedRestaurant['ratings'] = {
      aggregated: 0,
      totalReviews: 0,
    };
    
    let ratingSum = 0;
    let ratingCount = 0;
    
    for (const r of records) {
      if (r.ratings?.foursquare != null) {
        ratings.foursquare = r.ratings.foursquare;
        ratings.foursquareReviewCount = r.ratings.foursquareReviewCount;
        ratingSum += r.ratings.foursquare;
        ratingCount++;
        ratings.totalReviews += r.ratings.foursquareReviewCount || 0;
      }
      if (r.ratings?.here != null) {
        ratings.here = r.ratings.here;
        ratings.hereReviewCount = r.ratings.hereReviewCount;
        ratingSum += r.ratings.here;
        ratingCount++;
        ratings.totalReviews += r.ratings.hereReviewCount || 0;
      }
      if (r.ratings?.google != null) {
        ratings.google = r.ratings.google;
        ratings.googleReviewCount = r.ratings.googleReviewCount;
        ratingSum += r.ratings.google;
        ratingCount++;
        ratings.totalReviews += r.ratings.googleReviewCount || 0;
      }
    }
    
    ratings.aggregated = ratingCount > 0 ? ratingSum / ratingCount : 0;
    
    // Generate sentiment from ratings
    const sentiment = inferSentimentFromMetadata(
      allCategories,
      ratings.aggregated,
      ratings.totalReviews
    );
    
    // Build enhanced review summary
    const cuisineDesc = primary.cuisineType?.toLowerCase() || 'restaurant';
    const locationDesc = primary.city || 'the area';
    let reviewSummary = `${primary.name} is a ${cuisineDesc} in ${locationDesc}.`;
    if (sentiment.summary) {
      reviewSummary += ` ${sentiment.summary}`;
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
    
    merged.push({
      id: primary.id || `merged_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: primary.name || 'Unknown',
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
      cuisineType: primary.cuisineType || 'Restaurant',
      categories: allCategories,
      photos: allPhotos.slice(0, 20),
      menuUrl: records.find(r => r.menuUrl)?.menuUrl,
      reviewSummary,
      sentiment,
      yelpUrl: externalUrls.yelpUrl,
      googleMapsUrl: externalUrls.googleMapsUrl,
      doordashUrl: externalUrls.doordashUrl,
      ubereatsUrl: externalUrls.ubereatsUrl,
      grubhubUrl: externalUrls.grubhubUrl,
      scrapedAt: new Date().toISOString(),
      sources: allSources,
    });
  }
  
  return merged.sort((a, b) => b.ratings.aggregated - a.ratings.aggregated);
}

export async function scrapeRestaurants(opts: ScrapeOptions): Promise<ScrapedRestaurant[]> {
  const { 
    postalCode, 
    countryCode,
    radius, 
    radiusUnit = 'miles',
    limit, 
    foursquareKey, 
    hereKey, 
    googleKey 
  } = opts;
  
  console.log(`[Scraper] Fetching for ${postalCode}${countryCode ? ` (${countryCode})` : ''}, radius ${radius} ${radiusUnit}`);
  
  const coords = await getCoords(postalCode, countryCode);
  
  // Check if geocoding failed
  if (coords.lat === 0 && coords.lng === 0) {
    console.error(`[Scraper] Failed to geocode postal code: ${postalCode}`);
    return [];
  }
  
  const radiusMeters = toMeters(radius, radiusUnit);
  
  const [fsq, here, goog] = await Promise.allSettled([
    fetchFoursquare(coords, radiusMeters, foursquareKey, limit),
    fetchHERE(coords, radiusMeters, hereKey, limit),
    fetchGoogle(coords, radiusMeters, googleKey, limit),
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
  
  const merged = mergeRestaurants(all);
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

    const res = await fetch(url, {
      headers: { 'User-Agent': 'FoodieFinder/2.0' },
    });

    if (!res.ok) return null;

    const data = await res.json() as any;
    const locations = (data?.locations || []) as any[];
    const primary = locations.find((l) => l?.flavorOfTheDay);

    if (!primary?.flavorOfTheDay) return null;

    const nearby = locations
      .filter((l) => l !== primary && l?.flavorOfTheDay)
      .slice(0, 4)
      .map((l) => ({
        name: l.name || '',
        flavor: l.flavorOfTheDay?.name || '',
        description: l.flavorOfTheDay?.description || '',
        address: [l.address, l.city, l.state].filter(Boolean).join(', '),
      }));

    return {
      flavor: primary.flavorOfTheDay.name,
      description: primary.flavorOfTheDay.description || '',
      locationName: primary.name,
      address: [primary.address, primary.city, primary.state].filter(Boolean).join(', '),
      imageUrl: primary.flavorOfTheDay.imageUrl,
      nearbyLocations: nearby.length > 0 ? nearby : undefined,
    };
  } catch (e) {
    console.error('[Scraper] Culver\'s fetch error:', e);
    return null;
  }
}

// Legacy export for backward compatibility
export { ScrapeOptions as LegacyScrapeOptions };
