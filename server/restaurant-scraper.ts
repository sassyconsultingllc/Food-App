/**
 * Multi-Source Restaurant Scraper Service
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Aggregates restaurant data from Foursquare, HERE, and OpenStreetMap
 * to provide comprehensive coverage without Yelp dependency
 */

import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";
import {
  analyzeRestaurantSentiment,
  generateReviewSummary,
} from "./sentiment-phrases";
import type { SentimentResult } from "./types";

// Re-export SentimentResult for other modules
export type { SentimentResult };
import { addRestaurantToVectorStore } from "./rag";

// =============================================================================
// Types
// =============================================================================

export interface ScrapedRestaurant {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;           // Legacy alias for postalCode
  postalCode: string;        // International postal code
  country: string;           // Country name
  countryCode: string;       // ISO 3166-1 alpha-2
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
  
  // Ratings from different sources
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
  
  // Menu and ordering
  menuUrl?: string;
  directOrderUrl?: string;
  doordashUrl?: string;
  ubereatsUrl?: string;
  grubhubUrl?: string;
  yelpUrl?: string;
  googleMapsUrl?: string;
  
  // Additional info
  priceRange?: string;
  cuisineType: string;
  categories?: string[];
  hours?: Record<string, string>;
  photos?: string[];
  
  // Sentiment analysis
  sentiment: SentimentResult;
  reviewSummary: string;
  
  // Culver's specific
  isCulvers?: boolean;
  flavorOfTheDay?: string;
  flavorDescription?: string;
  
  // Data tracking
  scrapedAt: string;
  sources: string[];
}

export interface ScrapeOptions {
  zipCode?: string;          // Legacy - use postalCode instead
  postalCode?: string;       // International postal code
  countryCode?: string;      // Optional ISO country code to narrow geocoding
  radius: number;            // in miles (default) or km
  radiusUnit?: 'miles' | 'km';
  cuisineType?: string;
  limit?: number;
}

// =============================================================================
// Coordinate Lookup - INTERNATIONAL
// =============================================================================

interface GeoCoords {
  lat: number;
  lng: number;
  country?: string;
  countryCode?: string;
  city?: string;
  state?: string;
}

// In-memory cache for geocoded locations. Seeded EMPTY on purpose — there is
// no hardcoded coordinate data; every postal code is resolved live via
// Nominatim and then cached here for the process lifetime.
const GEOCODE_CACHE: Record<string, GeoCoords> = {};

/**
 * Geocode a postal code to coordinates - INTERNATIONAL
 * Uses Nominatim (OpenStreetMap) - no country restriction by default
 * Returns null if geocoding fails - callers must handle this case
 */
async function getCoordinatesFromPostalCode(
  postalCode: string,
  countryCode?: string
): Promise<GeoCoords | null> {
  const cacheKey = countryCode ? `${postalCode}:${countryCode}` : postalCode;
  
  // Check cache first
  if (GEOCODE_CACHE[cacheKey]) {
    return GEOCODE_CACHE[cacheKey];
  }
  
  // Use Nominatim (OpenStreetMap) for geocoding - free, no API key, worldwide
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('postalcode', postalCode);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    
    // Only add country filter if explicitly provided
    if (countryCode) {
      url.searchParams.set('countrycodes', countryCode.toLowerCase());
    }
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FoodieFinder/1.0 (contact@sassyconsultingllc.com)',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
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
        
        GEOCODE_CACHE[cacheKey] = coords; // Cache it
        return coords;
      }
    }
  } catch (error) {
    console.error('[Scraper] Nominatim geocoding failed:', error);
  }
  
  // Return null on failure - callers must handle
  console.error(`[Scraper] Could not geocode postal code: ${postalCode}`);
  return null;
}

// Legacy function name for backward compatibility
async function getCoordinatesFromZip(zipCode: string): Promise<{ lat: number; lng: number } | null> {
  return getCoordinatesFromPostalCode(zipCode, 'US');
}

// =============================================================================
// Foursquare Places API
// =============================================================================

async function fetchFromFoursquare(
  coords: { lat: number; lng: number },
  radiusMeters: number,
  cuisineType?: string,
  limit: number = 50
): Promise<Partial<ScrapedRestaurant>[]> {
  const apiKey = ENV.foursquareApiKey;
  if (!apiKey) {
    console.warn('FOURSQUARE_API_KEY not set - skipping Foursquare');
    return [];
  }

  try {
    const categoryId = '13065'; // Restaurants category
    const query = cuisineType || '';
    
    const url = new URL('https://api.foursquare.com/v3/places/search');
    url.searchParams.set('ll', `${coords.lat},${coords.lng}`);
    url.searchParams.set('radius', String(radiusMeters));
    url.searchParams.set('categories', categoryId);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('fields', 'fsq_id,name,location,categories,rating,stats,price,hours,tel,website,photos,tips');
    if (query) url.searchParams.set('query', query);

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Foursquare API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results = data.results || [];

    return results.map((place: any) => {
      const location = place.location || {};
      const tips = place.tips || [];
      const reviews = tips.map((t: any) => t.text).filter(Boolean);
      
      return {
        id: `fsq_${place.fsq_id}`,
        name: place.name,
        address: location.formatted_address || location.address || '',
        city: location.locality || '',
        state: location.region || '',
        zipCode: location.postcode || '',
        latitude: place.geocodes?.main?.latitude || coords.lat,
        longitude: place.geocodes?.main?.longitude || coords.lng,
        phone: place.tel,
        website: place.website,
        ratings: {
          foursquare: place.rating ? place.rating / 2 : undefined, // FSQ uses 10-point scale
          foursquareReviewCount: place.stats?.total_ratings,
        },
        priceRange: place.price ? '$'.repeat(place.price) : undefined,
        cuisineType: place.categories?.[0]?.name || 'Restaurant',
        categories: place.categories?.map((c: any) => c.name) || [],
        photos: place.photos?.map((p: any) => `${p.prefix}original${p.suffix}`) || [],
        reviews,
        sources: ['foursquare'],
      };
    });
  } catch (error) {
    console.error('Foursquare fetch error:', error);
    return [];
  }
}

// =============================================================================
// HERE Places API
// =============================================================================

async function fetchFromHERE(
  coords: { lat: number; lng: number },
  radiusMeters: number,
  cuisineType?: string,
  limit: number = 50
): Promise<Partial<ScrapedRestaurant>[]> {
  const apiKey = ENV.hereApiKey;
  if (!apiKey) {
    console.warn('HERE_API_KEY not set - skipping HERE');
    return [];
  }

  try {
    const categoryId = '100-1000-0000'; // Restaurants
    const query = cuisineType ? `&q=${encodeURIComponent(cuisineType)}` : '';
    
    const url = `https://discover.search.hereapi.com/v1/discover?at=${coords.lat},${coords.lng}&limit=${limit}&in=circle:${coords.lat},${coords.lng};r=${radiusMeters}&categories=${categoryId}${query}&apiKey=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`HERE API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const items = data.items || [];

    return items.map((place: any) => {
      const address = place.address || {};
      
      return {
        id: `here_${place.id}`,
        name: place.title,
        address: address.label || '',
        city: address.city || '',
        state: address.stateCode || address.state || '',
        zipCode: address.postalCode || '',
        latitude: place.position?.lat || coords.lat,
        longitude: place.position?.lng || coords.lng,
        phone: place.contacts?.[0]?.phone?.[0]?.value,
        website: place.contacts?.[0]?.www?.[0]?.value,
        ratings: {
          here: place.averageRating,
          hereReviewCount: place.totalRatings,
        },
        priceRange: place.priceRange ? '$'.repeat(place.priceRange) : undefined,
        cuisineType: place.categories?.[0]?.name || 'Restaurant',
        categories: place.categories?.map((c: any) => c.name) || [],
        hours: parseHEREHours(place.openingHours),
        sources: ['here'],
      };
    });
  } catch (error) {
    console.error('HERE fetch error:', error);
    return [];
  }
}

// HERE's openingHours.text returns day prefixes like "Mon: 11:00 - 22:00".
// The UI reads hours.monday / hours.tuesday etc., so we normalize short
// day keys to full lowercase names. Previously short keys were written
// verbatim, and the UI silently dropped every HERE-sourced hours record.
const HERE_DAY_KEY_MAP: Record<string, string> = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
  sunday: "sunday",
};

function parseHEREHours(openingHours: any): Record<string, string> | undefined {
  if (!openingHours?.text) return undefined;

  const hours: Record<string, string> = {};
  const lines = openingHours.text;

  if (Array.isArray(lines)) {
    lines.forEach((line: string) => {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const normalized = HERE_DAY_KEY_MAP[match[1].toLowerCase()];
        if (normalized) hours[normalized] = match[2];
      }
    });
  }

  return Object.keys(hours).length > 0 ? hours : undefined;
}

// =============================================================================
// OpenStreetMap Overpass API (Free, no key needed)
// =============================================================================

async function fetchFromOpenStreetMap(
  coords: { lat: number; lng: number },
  radiusMeters: number,
  cuisineType?: string,
  limit: number = 50
): Promise<Partial<ScrapedRestaurant>[]> {
  try {
    // Overpass QL query for restaurants
    // Sanitize before interpolating into Overpass QL (see worker/scraper.ts):
    // keep only letters/digits/space/_/- so a crafted cuisineType can't break
    // out of the regex literal and inject extra query clauses.
    const safeCuisine = cuisineType?.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const cuisineFilter = safeCuisine
      ? `["cuisine"~"${safeCuisine}",i]`
      : '';
    
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="restaurant"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});
        node["amenity"="fast_food"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});
        node["amenity"="cafe"]["cuisine"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});
        way["amenity"="restaurant"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});
        way["amenity"="fast_food"]${cuisineFilter}(around:${radiusMeters},${coords.lat},${coords.lng});
      );
      out center ${limit};
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'FoodieFinder/1.0 (contact@sassyconsultingllc.com)',
      },
    });

    if (!response.ok) {
      console.error(`Overpass API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const elements = data.elements || [];

    return elements.map((el: any) => {
      const tags = el.tags || {};
      const lat = el.lat || el.center?.lat;
      const lng = el.lon || el.center?.lon;
      
      // Build address from OSM tags
      const addressParts = [
        tags['addr:housenumber'],
        tags['addr:street'],
      ].filter(Boolean);
      
      return {
        id: `osm_${el.type}_${el.id}`,
        name: tags.name || 'Unknown Restaurant',
        address: addressParts.join(' ') || tags['addr:full'] || '',
        city: tags['addr:city'] || '',
        state: tags['addr:state'] || '',
        zipCode: tags['addr:postcode'] || '',
        latitude: lat,
        longitude: lng,
        phone: tags.phone || tags['contact:phone'],
        website: tags.website || tags['contact:website'],
        priceRange: tags.price_range,
        cuisineType:
          formatCuisine(tags.cuisine) ||
          (tags.amenity === 'fast_food' ? 'Fast Food' : 'Restaurant'),
        categories: tags.cuisine ? tags.cuisine.split(';').map((c: string) => c.trim()) : [],
        hours: parseOSMHours(tags.opening_hours),
        sources: ['openstreetmap'],
      };
    });
  } catch (error) {
    console.error('OpenStreetMap fetch error:', error);
    return [];
  }
}

function formatCuisine(cuisine?: string): string {
  if (!cuisine) return 'Restaurant';
  // OSM cuisines are semicolon-separated, take the first one and capitalize
  const first = cuisine.split(';')[0].trim();
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/_/g, ' ');
}

// Google Places `types` come back as machine tokens — "fast_food",
// "meal_takeaway", "liquor_store". Render them as human strings before
// storing on the restaurant record.
function formatGoogleType(t?: string): string | undefined {
  if (!t) return undefined;
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Mirrors worker/scraper.ts. Unambiguous non-food category tokens — a real
// restaurant never carries these, so any record with one is contamination
// from a fuzzy provider match and gets dropped before reaching the reel.
const NON_FOOD_CATEGORY_TOKENS = [
  'hardware', 'house & garden', 'home & garden', 'home improvement',
  'furniture', 'clothing', 'apparel', 'shoe', 'jewelry', 'department store',
  'grocery', 'supermarket', 'convenience store', 'liquor store', 'pharmacy',
  'drugstore', 'gas station', 'petrol', 'fuel', 'automotive', 'car repair',
  'car dealer', 'hotel', 'motel', 'lodging', 'hospital', 'clinic', 'dentist',
  'bank', 'atm', 'hair salon', 'beauty salon', 'nail salon', 'barber', 'spa',
  'gym', 'fitness', 'school', 'university', 'church', 'government', 'library',
  'gallery', 'museum', 'storage', 'real estate',
];

function isNonFoodPlace(categories: string[] = [], cuisineType?: string): boolean {
  const haystack = [...categories, cuisineType || ''].map((c) => c.toLowerCase());
  return haystack.some((c) => NON_FOOD_CATEGORY_TOKENS.some((tok) => c.includes(tok)));
}

// Mirrors worker/scraper.ts. Provider categories are unreliable for the
// user-facing cuisine label (Foursquare buckets sushi as "Fast Food", a diner
// as "Bakery"). Prefer a specific cuisine in the categories; else infer from
// the restaurant name; else fall back to the first non-generic category.
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

function inferCuisine(name: string, categories: string[] = [], fallback?: string): string {
  for (const cat of categories) {
    const c = (cat || '').toLowerCase();
    if (GENERIC_CUISINE_CATEGORIES.has(c)) continue;
    for (const [re, label] of CUISINE_KEYWORDS) {
      if (re.test(c)) return label;
    }
  }
  for (const [re, label] of CUISINE_KEYWORDS) {
    if (re.test(name)) return label;
  }
  const specific = categories.find((c) => c && !GENERIC_CUISINE_CATEGORIES.has(c.toLowerCase()));
  if (specific) return specific;
  if (fallback && !GENERIC_CUISINE_CATEGORIES.has(fallback.toLowerCase())) return fallback;
  return 'Restaurant';
}

function parseOSMHours(hoursString?: string): Record<string, string> | undefined {
  if (!hoursString) return undefined;
  
  // Simple parsing - OSM hours format is complex
  // Example: "Mo-Fr 11:00-22:00; Sa-Su 10:00-23:00"
  const hours: Record<string, string> = {};
  const dayMap: Record<string, string> = {
    'Mo': 'monday', 'Tu': 'tuesday', 'We': 'wednesday',
    'Th': 'thursday', 'Fr': 'friday', 'Sa': 'saturday', 'Su': 'sunday',
  };
  
  try {
    const parts = hoursString.split(';');
    parts.forEach(part => {
      const match = part.trim().match(/^([A-Za-z,-]+)\s+(.+)$/);
      if (match) {
        const [, days, time] = match;
        // Expand day ranges like "Mo-Fr"
        const dayRange = days.match(/(\w{2})-(\w{2})/);
        if (dayRange) {
          const dayKeys = Object.keys(dayMap);
          const startIdx = dayKeys.indexOf(dayRange[1]);
          const endIdx = dayKeys.indexOf(dayRange[2]);
          if (startIdx !== -1 && endIdx !== -1) {
            for (let i = startIdx; i <= endIdx; i++) {
              hours[dayMap[dayKeys[i]]] = time;
            }
          }
        } else {
          // Single day
          const day = dayMap[days.substring(0, 2)];
          if (day) hours[day] = time;
        }
      }
    });
  } catch {
    // If parsing fails, return undefined
    return undefined;
  }
  
  return Object.keys(hours).length > 0 ? hours : undefined;
}

// =============================================================================
// Google Place Details Enrichment — fetches full photos + menu URL
// =============================================================================

async function enrichGooglePlace(place: any, apiKey: string) {
  try {
    const fields = 'formatted_address,formatted_phone_number,website,photos,url,address_components';
    const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=${fields}&key=${apiKey}`;
    const res = await fetch(detailUrl);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;
    const d = data.result;

    // Extract address components
    let city = '', state = '', zipCode = '';
    for (const comp of d.address_components || []) {
      if (comp.types.includes('locality')) city = comp.long_name;
      if (comp.types.includes('administrative_area_level_1')) state = comp.short_name;
      if (comp.types.includes('postal_code')) zipCode = comp.long_name;
    }

    // Build photo URLs from details (up to 20)
    const photos = (d.photos || []).slice(0, 20).map((p: any) =>
      `/api/photo?ref=${encodeURIComponent(p.photo_reference)}&maxwidth=800`
    );

    // Construct a menu search URL via the place's website
    const menuUrl = d.website
      ? `${d.website}${d.website.endsWith('/') ? '' : '/'}menu`
      : undefined;

    return {
      formatted_address: d.formatted_address,
      phone: d.formatted_phone_number,
      website: d.website,
      photos,
      menuUrl: d.website ? menuUrl : undefined,
      city,
      state,
      zipCode,
    };
  } catch (e) {
    console.warn(`[enrichGooglePlace] Failed for ${place.place_id}:`, e);
    return null;
  }
}

// =============================================================================
// Google Places API
// =============================================================================

async function fetchFromGooglePlaces(
  coords: { lat: number; lng: number },
  radiusMeters: number,
  cuisineType?: string,
  limit: number = 50
): Promise<Partial<ScrapedRestaurant>[]> {
  const apiKey = ENV.googlePlacesApiKey;
  if (!apiKey) {
    console.warn('GOOGLE_PLACES_API_KEY not set - skipping Google Places');
    return [];
  }

  try {
    const keyword = cuisineType || 'restaurant';
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${coords.lat},${coords.lng}&radius=${radiusMeters}&type=restaurant&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Google Places API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', data.status, data.error_message);
      return [];
    }

    const places = data.results?.slice(0, limit) || [];

    // Enrich each place with Place Details. Google Places Details has a
    // soft QPS limit (~100 default) that's easy to exceed with a 50-result
    // search firing 50 concurrent details calls. Bound to 5-concurrent so
    // we stay well under the QPS ceiling and don't burst-bill the project.
    const ENRICH_CONCURRENCY = 5;
    type EnrichResult = PromiseSettledResult<Awaited<ReturnType<typeof enrichGooglePlace>>>;
    const enriched: EnrichResult[] = [];
    for (let i = 0; i < places.length; i += ENRICH_CONCURRENCY) {
      const batch = places.slice(i, i + ENRICH_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((place: any) => enrichGooglePlace(place, apiKey!))
      );
      enriched.push(...batchResults);
    }

    return enriched.map((result, i) => {
      const place = places[i];
      const details = result.status === 'fulfilled' ? result.value : null;

      // Use details photos if available (up to 20), fall back to search photo
      const searchPhoto = place.photos?.[0]
        ? `/api/photo?ref=${encodeURIComponent(place.photos[0].photo_reference)}&maxwidth=800`
        : undefined;
      const detailPhotos = details?.photos || [];
      const photos = detailPhotos.length > 0 ? detailPhotos : (searchPhoto ? [searchPhoto] : []);

      return {
        id: `google_${place.place_id}`,
        name: place.name,
        address: details?.formatted_address || place.vicinity || place.formatted_address || '',
        city: details?.city || '',
        state: details?.state || '',
        zipCode: details?.zipCode || '',
        latitude: place.geometry?.location?.lat || coords.lat,
        longitude: place.geometry?.location?.lng || coords.lng,
        phone: details?.phone || place.formatted_phone_number,
        website: details?.website || place.website,
        ratings: {
          google: place.rating,
          googleReviewCount: place.user_ratings_total,
          aggregated: place.rating || 0,
          totalReviews: place.user_ratings_total || 0,
        },
        priceRange: place.price_level ? '$'.repeat(place.price_level) : undefined,
        cuisineType: formatGoogleType(
          place.types?.find((t: string) =>
            !['restaurant', 'food', 'point_of_interest', 'establishment'].includes(t)
          )
        ) || 'Restaurant',
        categories: (place.types || []).map((t: string) => formatGoogleType(t) || t),
        photos,
        menuUrl: details?.menuUrl,
        sources: ['google'],
      };
    });
  } catch (error) {
    console.error('Google Places fetch error:', error);
    return [];
  }
}

// =============================================================================
// Culver's API
// =============================================================================

async function fetchCulversLocations(
  coords: { lat: number; lng: number },
  limit: number = 10
): Promise<Partial<ScrapedRestaurant>[]> {
  try {
    const response = await fetch(
      `https://www.culvers.com/api/locator/getLocations?lat=${coords.lat}&long=${coords.lng}&limit=${limit}`
    );

    if (!response.ok) {
      console.warn(`Culver's API returned ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data.isSuccessful || !data.data?.geofences) {
      return [];
    }

    return data.data.geofences.map((location: any) => {
      const meta = location.metadata || {};
      // `description` is a store-locator label ("McFarland, WI - Farwell St"),
      // not the brand. Use the brand (city-suffixed for disambiguation) so the
      // reel shows "Culver's", not a location string. See worker/scraper.ts.
      const brandName = meta.city ? `Culver's - ${meta.city}` : "Culver's";
      return {
        id: `culvers_${location._id}`,
        name: brandName,
        address: meta.street || '',
        city: meta.city || '',
        state: meta.state || '',
        zipCode: meta.postalCode || '',
        latitude: location.geometryCenter?.coordinates?.[1] || coords.lat,
        longitude: location.geometryCenter?.coordinates?.[0] || coords.lng,
        phone: meta.phone,
        website: 'https://www.culvers.com',
        ratings: {
          aggregated: 4.5,
          totalReviews: 0,
        },
        priceRange: '$',
        cuisineType: 'Fast Food',
        categories: ['Fast Food', 'Burgers', 'Ice Cream'],
        hours: meta.dineInHours,
        isCulvers: true,
        flavorOfTheDay: meta.flavorOfDayName || null,
        flavorDescription: meta.flavorOfTheDayDescription || null,
        sources: ['culvers'],
      };
    });
  } catch (error) {
    console.error('Culver\'s fetch error:', error);
    return [];
  }
}

// =============================================================================
// Deduplication & Aggregation
// =============================================================================

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeString(a);
  const normB = normalizeString(b);
  
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;
  
  // Simple Jaccard similarity on character trigrams
  const trigramsA = new Set<string>();
  const trigramsB = new Set<string>();
  
  for (let i = 0; i < normA.length - 2; i++) {
    trigramsA.add(normA.substring(i, i + 3));
  }
  for (let i = 0; i < normB.length - 2; i++) {
    trigramsB.add(normB.substring(i, i + 3));
  }
  
  const intersection = [...trigramsA].filter(t => trigramsB.has(t)).length;
  const union = new Set([...trigramsA, ...trigramsB]).size;
  
  return union > 0 ? intersection / union : 0;
}

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // Return in meters
}

function deduplicateAndMerge(
  restaurants: Partial<ScrapedRestaurant>[]
): ScrapedRestaurant[] {
  const merged: ScrapedRestaurant[] = [];
  const used = new Set<number>();

  for (let i = 0; i < restaurants.length; i++) {
    if (used.has(i)) continue;

    const base = restaurants[i];
    const duplicates: Partial<ScrapedRestaurant>[] = [base];
    used.add(i);

    // Find duplicates
    for (let j = i + 1; j < restaurants.length; j++) {
      if (used.has(j)) continue;

      const candidate = restaurants[j];
      
      // Check name similarity
      const nameSim = calculateSimilarity(base.name || '', candidate.name || '');
      
      // Check distance (within 100m)
      const distance = haversineDistance(
        base.latitude || 0, base.longitude || 0,
        candidate.latitude || 0, candidate.longitude || 0
      );

      if (nameSim > 0.7 && distance < 100) {
        duplicates.push(candidate);
        used.add(j);
      }
    }

    // Merge duplicates into single record
    merged.push(mergeRestaurantRecords(duplicates));
  }

  return merged;
}

/**
 * Generate external service URLs from restaurant metadata. Mirrors
 * worker/scraper.ts::generateExternalUrls so local dev produces the same
 * Yelp / Google Maps / delivery links as production.
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

function mergeRestaurantRecords(
  records: Partial<ScrapedRestaurant>[]
): ScrapedRestaurant {
  // Prefer records with more data
  const sorted = records.sort((a, b) => {
    const scoreA = (a.phone ? 1 : 0) + (a.website ? 1 : 0) + (a.hours ? 1 : 0) + (a.ratings?.aggregated ? 1 : 0);
    const scoreB = (b.phone ? 1 : 0) + (b.website ? 1 : 0) + (b.hours ? 1 : 0) + (b.ratings?.aggregated ? 1 : 0);
    return scoreB - scoreA;
  });

  const primary = sorted[0];
  const allSources = [...new Set(records.flatMap(r => r.sources || []))];
  const allCategories = [...new Set(records.flatMap(r => r.categories || []))];
  const allPhotos = [...new Set(records.flatMap(r => r.photos || []))];
  const allReviews = records.flatMap(r => (r as any).reviews || []);

  // Aggregate ratings
  let totalWeightedRating = 0;
  let totalReviews = 0;
  const ratings: ScrapedRestaurant['ratings'] = { aggregated: 0, totalReviews: 0 };

  records.forEach(r => {
    if (r.ratings?.foursquare != null) {
      ratings.foursquare = r.ratings.foursquare;
      ratings.foursquareReviewCount = r.ratings.foursquareReviewCount || 0;
      const count = r.ratings.foursquareReviewCount || 1; // Default weight 1 if no count
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
  });

  ratings.aggregated = totalReviews > 0 
    ? Math.round((totalWeightedRating / totalReviews) * 10) / 10 
    : 0;
  ratings.totalReviews = totalReviews;

  // Generate sentiment from any collected reviews
  const reviewText = allReviews.join(' ');
  const sentiment = reviewText 
    ? analyzeRestaurantSentiment(reviewText)
    : getDefaultSentiment();

  const reviewSummary = allReviews.length > 0
    ? generateReviewSummary(allReviews, primary.name || 'Restaurant')
    : `${primary.name} is a ${primary.cuisineType?.toLowerCase() || 'restaurant'} in ${primary.city || 'the area'}.`;

  // Build external URLs from merged address info
  const mergedName = primary.name || 'Unknown Restaurant';
  const mergedAddress = primary.address || '';
  const mergedCity = primary.city || '';
  const mergedState = primary.state || '';
  const mergedCountry = primary.country || 'United States';
  const mergedLat = primary.latitude || 0;
  const mergedLng = primary.longitude || 0;
  const externalUrls = generateExternalUrls(
    mergedName,
    mergedAddress,
    mergedCity,
    mergedState,
    mergedCountry,
    mergedLat,
    mergedLng
  );

  return {
    id: primary.id || `merged_${Date.now()}`,
    name: mergedName,
    address: mergedAddress,
    city: mergedCity,
    state: mergedState,
    zipCode: primary.zipCode || '',
    postalCode: primary.postalCode || primary.zipCode || '',
    country: mergedCountry,
    countryCode: primary.countryCode || 'US',
    latitude: mergedLat,
    longitude: mergedLng,
    phone: records.find(r => r.phone)?.phone,
    website: records.find(r => r.website)?.website,
    ratings,
    priceRange: records.find(r => r.priceRange)?.priceRange,
    cuisineType: inferCuisine(mergedName, allCategories, primary.cuisineType),
    categories: allCategories,
    hours: records.find(r => r.hours)?.hours,
    photos: allPhotos.slice(0, 20),
    menuUrl: records.find(r => r.menuUrl)?.menuUrl,
    sentiment,
    reviewSummary,
    isCulvers: records.some(r => r.isCulvers),
    flavorOfTheDay: records.find(r => r.flavorOfTheDay)?.flavorOfTheDay,
    flavorDescription: records.find(r => r.flavorDescription)?.flavorDescription,
    // External service links (Yelp / Maps / delivery)
    yelpUrl: externalUrls.yelpUrl,
    googleMapsUrl: externalUrls.googleMapsUrl,
    doordashUrl: externalUrls.doordashUrl,
    ubereatsUrl: externalUrls.ubereatsUrl,
    grubhubUrl: externalUrls.grubhubUrl,
    scrapedAt: new Date().toISOString(),
    sources: allSources,
  };
}

function getDefaultSentiment(): SentimentResult {
  return {
    score: 0.5,
    sentiment: 'neutral',
    positiveCount: 0,
    negativeCount: 0,
    summary: 'No reviews available yet.',
    highlights: [],
    warnings: [],
  };
}

// =============================================================================
// Main Scraper Function
// =============================================================================

export async function scrapeRestaurantsByLocation(
  options: ScrapeOptions
): Promise<ScrapedRestaurant[]> {
  // Support both legacy zipCode and new postalCode
  const postalCode = options.postalCode || options.zipCode;
  if (!postalCode) {
    throw new Error('postalCode or zipCode is required');
  }
  
  const { countryCode, radius, radiusUnit = 'miles', cuisineType, limit = 50 } = options;
  
  console.log(`[Scraper] Fetching restaurants for ${postalCode}${countryCode ? ` (${countryCode})` : ''}, radius: ${radius} ${radiusUnit}, cuisine: ${cuisineType || 'all'}`);
  
  const coords = await getCoordinatesFromPostalCode(postalCode, countryCode);
  
  // Check if geocoding failed
  if (!coords) {
    console.error(`[Scraper] Failed to geocode postal code: ${postalCode}`);
    return [];
  }
  
  // Convert radius to meters
  const radiusKm = radiusUnit === 'km' ? radius : radius * 1.60934;
  const radiusMeters = Math.min(radiusKm * 1000, 50000); // Max 50km

  // Fetch from all sources in parallel
  const [foursquareResults, hereResults, osmResults, googleResults, culversResults] = await Promise.allSettled([
    fetchFromFoursquare(coords, radiusMeters, cuisineType, limit),
    fetchFromHERE(coords, radiusMeters, cuisineType, limit),
    fetchFromOpenStreetMap(coords, radiusMeters, cuisineType, limit),
    fetchFromGooglePlaces(coords, radiusMeters, cuisineType, limit),
    // Only fetch Culver's if no specific cuisine filter or if it matches
    (!cuisineType || cuisineType.toLowerCase().includes('fast') || cuisineType.toLowerCase().includes('burger'))
      ? fetchCulversLocations(coords, 10)
      : Promise.resolve([]),
  ]);

  // Collect successful results
  const allRestaurants: Partial<ScrapedRestaurant>[] = [];
  
  if (foursquareResults.status === 'fulfilled') {
    console.log(`[Scraper] Foursquare returned ${foursquareResults.value.length} results`);
    allRestaurants.push(...foursquareResults.value);
  } else {
    console.error('[Scraper] Foursquare failed:', foursquareResults.reason);
  }

  if (hereResults.status === 'fulfilled') {
    console.log(`[Scraper] HERE returned ${hereResults.value.length} results`);
    allRestaurants.push(...hereResults.value);
  } else {
    console.error('[Scraper] HERE failed:', hereResults.reason);
  }

  if (osmResults.status === 'fulfilled') {
    console.log(`[Scraper] OpenStreetMap returned ${osmResults.value.length} results`);
    allRestaurants.push(...osmResults.value);
  } else {
    console.error('[Scraper] OpenStreetMap failed:', osmResults.reason);
  }

  if (googleResults.status === 'fulfilled') {
    console.log(`[Scraper] Google Places returned ${googleResults.value.length} results`);
    allRestaurants.push(...googleResults.value);
  } else {
    console.error('[Scraper] Google Places failed:', googleResults.reason);
  }

  if (culversResults.status === 'fulfilled') {
    console.log(`[Scraper] Culver's returned ${culversResults.value.length} results`);
    allRestaurants.push(...culversResults.value);
  }

  if (allRestaurants.length === 0) {
    console.warn(`[Scraper] No restaurants found for ${postalCode}. Check API keys.`);
    return [];
  }

  // Deduplicate and merge records from different sources
  let merged = deduplicateAndMerge(allRestaurants);
  // Drop non-food contamination (hardware stores, salons, etc.) a fuzzy
  // provider search may have injected. Mirrors worker/scraper.ts.
  const beforeFilter = merged.length;
  merged = merged.filter((r) => !isNonFoodPlace(r.categories, r.cuisineType));
  if (merged.length !== beforeFilter) {
    console.log(`[Scraper] Dropped ${beforeFilter - merged.length} non-food records`);
  }
  console.log(`[Scraper] Merged ${allRestaurants.length} records into ${merged.length} unique restaurants`);

  // Sort by rating (highest first), then by review count
  merged.sort((a, b) => {
    if (b.ratings.aggregated !== a.ratings.aggregated) {
      return b.ratings.aggregated - a.ratings.aggregated;
    }
    return b.ratings.totalReviews - a.ratings.totalReviews;
  });

  // Index to vector store with bounded concurrency. Previously this was a
  // forEach of fire-and-forget promises — for a 50-restaurant scrape that's
  // 50 simultaneous calls into the embedding service, exhausting CPU and
  // tripping rate limits. Cap at 5 concurrent and don't block the caller's
  // response — kick off the whole indexing pass in the background.
  const indexInBackground = async () => {
    const CONCURRENCY = 5;
    for (let i = 0; i < merged.length; i += CONCURRENCY) {
      const batch = merged.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(restaurant =>
          addRestaurantToVectorStore({
            id: restaurant.id,
            name: restaurant.name,
            reviews: [],
            description: restaurant.reviewSummary,
            cuisineType: restaurant.cuisineType,
          })
        )
      ).then(results => {
        for (const r of results) {
          if (r.status === "rejected") {
            console.error("[scraper] vector-store index failed:", r.reason);
          }
        }
      });
    }
  };
  // Detached on purpose — the scrape result should return immediately.
  // .catch is the guard against unhandled rejections from the IIFE itself.
  indexInBackground().catch(err =>
    console.error("[scraper] vector-store batch error:", err)
  );

  return merged.slice(0, limit);
}

// =============================================================================
// Culver's Flavor of the Day (Standalone)
// =============================================================================

export async function fetchCulversFlavorOfTheDay(
  zipCode: string
): Promise<{
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
    const coords = await getCoordinatesFromZip(zipCode);
    
    if (!coords) {
      console.error(`[Scraper] Could not geocode ZIP for Culver's: ${zipCode}`);
      return null;
    }

    const response = await fetch(
      `https://www.culvers.com/api/locator/getLocations?lat=${coords.lat}&long=${coords.lng}&limit=5`
    );

    if (!response.ok) {
      console.error(`Culver's API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.isSuccessful || !data.data?.geofences?.length) {
      return null;
    }

    const locations = data.data.geofences;
    const nearest = locations[0];
    
    // Only return if we have actual flavor data
    const flavorName = nearest.metadata?.flavorOfDayName;
    if (!flavorName) {
      return null;
    }

    return {
      flavor: flavorName,
      description: nearest.metadata?.flavorOfTheDayDescription || '',
      locationName: nearest.description || '',
      address: nearest.metadata?.street || '',
      imageUrl: nearest.metadata?.flavorOfDaySlug
        ? `https://www.culvers.com/images/fotd/${nearest.metadata.flavorOfDaySlug}`
        : undefined,
      nearbyLocations: locations.slice(1, 4)
        .filter((loc: any) => loc.metadata?.flavorOfDayName)
        .map((loc: any) => ({
          name: loc.description || '',
          flavor: loc.metadata?.flavorOfDayName || '',
          description: loc.metadata?.flavorOfTheDayDescription || '',
          address: loc.metadata?.street || '',
        })),
    };
  } catch (error) {
    console.error('Error fetching Culver\'s data:', error);
    return null;
  }
}
