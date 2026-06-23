/**
 * Culver's Flavor of the Day Service
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Fetches real-time Flavor of the Day data from Culver's API.
 *
 * NOTE: the live Culver's path the app uses is
 * server/restaurant-scraper.ts::fetchCulversFlavorOfTheDay. This module is a
 * standalone helper kept for parity. It must NEVER fall back to a default
 * location — ZIPs are geocoded live via Nominatim and an unresolved ZIP returns
 * [] so Culver's from the wrong locale (previously a hardcoded Madison, WI
 * default) can never surface.
 */

// Runtime-only geocode cache. Intentionally seeded EMPTY — there is no
// hardcoded coordinate data. It self-populates from Nominatim as ZIPs resolve.
const GEO_CACHE: Record<string, { lat: number; long: number }> = {};

export interface CulversLocation {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone?: string;
  flavorOfDay: string;
  flavorDescription: string;
  flavorImage?: string;
  distance?: number;
  hours?: {
    dineIn?: string;
    driveThru?: string;
    curbside?: string;
  };
}

export interface CulversApiResponse {
  isSuccessful: boolean;
  message: string | null;
  data: {
    meta: { code: number };
    geofences: Array<{
      _id: string;
      live: boolean;
      description: string;
      geometryRadius: number;
      metadata: {
        flavorOfDayName: string;
        flavorOfTheDayDescription: string;
        flavorOfDaySlug?: string;
        slug: string;
        street: string;
        city: string;
        state: string;
        postalCode: string;
        phone?: string;
        dineInHours?: Record<string, string>;
        driveThruHours?: Record<string, string>;
        curbsideHours?: Record<string, string>;
      };
    }>;
  };
}

/**
 * Geocode a US ZIP to coordinates via Nominatim (OpenStreetMap). Culver's is
 * US-only. Returns null when the ZIP can't be resolved — callers MUST handle
 * null and must NOT substitute a default location.
 */
async function getCoordinatesFromZip(
  zipCode: string
): Promise<{ lat: number; long: number } | null> {
  if (GEO_CACHE[zipCode]) return GEO_CACHE[zipCode];

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("postalcode", zipCode);
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: { "User-Agent": "FoodieFinder/1.0 (contact@sassyconsultingllc.com)" },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        const coords = { lat: parseFloat(data[0].lat), long: parseFloat(data[0].lon) };
        GEO_CACHE[zipCode] = coords;
        return coords;
      }
    }
  } catch (error) {
    console.error("[Culvers] Nominatim geocoding failed:", error);
  }

  console.error(`[Culvers] Could not geocode ZIP: ${zipCode}`);
  return null;
}

/**
 * Fetch Culver's locations and their Flavor of the Day by ZIP code.
 */
export async function getCulversFlavorOfTheDay(
  zipCode: string,
  limit: number = 10
): Promise<CulversLocation[]> {
  try {
    const coords = await getCoordinatesFromZip(zipCode);
    if (!coords) {
      // No fallback location: an unresolved ZIP returns no flavors rather than
      // Culver's from the wrong locale.
      return [];
    }

    const response = await fetch(
      `https://www.culvers.com/api/locator/getLocations?lat=${coords.lat}&long=${coords.long}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`Culver's API returned ${response.status}`);
    }

    const data: CulversApiResponse = await response.json();

    if (!data.isSuccessful || !data.data?.geofences) {
      throw new Error("Invalid response from Culver's API");
    }

    return data.data.geofences.map((location) => ({
      id: location._id,
      // `description` is a store-locator label ("City, ST - Street"), not the
      // brand. Keep it as a location descriptor; expose "Culver's" as the name.
      name: location.metadata.city ? `Culver's - ${location.metadata.city}` : "Culver's",
      slug: location.metadata.slug || "",
      address: location.metadata.street || "",
      city: location.metadata.city || "",
      state: location.metadata.state || "",
      postalCode: location.metadata.postalCode || "",
      phone: location.metadata.phone,
      flavorOfDay: location.metadata.flavorOfDayName || "Not Available",
      flavorDescription: location.metadata.flavorOfTheDayDescription || "",
      flavorImage: location.metadata.flavorOfDaySlug
        ? `https://www.culvers.com/images/fotd/${location.metadata.flavorOfDaySlug}`
        : undefined,
      distance: location.geometryRadius,
    }));
  } catch (error) {
    console.error("Error fetching Culver's data:", error);
    throw error;
  }
}

/**
 * Get the nearest Culver's location with Flavor of the Day
 */
export async function getNearestCulversFlavorOfTheDay(
  zipCode: string
): Promise<CulversLocation | null> {
  const locations = await getCulversFlavorOfTheDay(zipCode, 1);
  return locations[0] || null;
}
