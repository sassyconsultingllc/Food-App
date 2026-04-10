/**
 * Culver's Flavor of the Day Service
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Fetches real-time Flavor of the Day data from Culver's API
 */

// US ZIP code to approximate lat/long mapping for major areas
// This is a simplified approach - in production, use a proper geocoding service
const ZIP_COORDINATES: Record<string, { lat: number; long: number }> = {
  // Wisconsin
  "53703": { lat: 43.0731, long: -89.4012 }, // Madison
  "53704": { lat: 43.0821, long: -89.3852 },
  "53705": { lat: 43.0691, long: -89.4512 },
  "53706": { lat: 43.0761, long: -89.4112 },
  "53711": { lat: 43.0431, long: -89.4312 },
  "53713": { lat: 43.0331, long: -89.4012 },
  "53714": { lat: 43.0931, long: -89.3212 },
  "53716": { lat: 43.0631, long: -89.3312 },
  "53717": { lat: 43.0731, long: -89.4812 },
  "53718": { lat: 43.1131, long: -89.2812 },
  "53719": { lat: 43.0231, long: -89.4812 },
  "53726": { lat: 43.0731, long: -89.4312 },
  // Milwaukee area
  "53202": { lat: 43.0389, long: -87.9065 },
  "53203": { lat: 43.0339, long: -87.9165 },
  "53204": { lat: 43.0189, long: -87.9265 },
  "53211": { lat: 43.0789, long: -87.8865 },
  "53212": { lat: 43.0689, long: -87.9065 },
  // Chicago area
  "60601": { lat: 41.8819, long: -87.6278 },
  "60602": { lat: 41.8829, long: -87.6318 },
  "60603": { lat: 41.8799, long: -87.6298 },
  "60604": { lat: 41.8779, long: -87.6268 },
  "60605": { lat: 41.8669, long: -87.6188 },
  "60606": { lat: 41.8829, long: -87.6398 },
  "60607": { lat: 41.8729, long: -87.6498 },
  "60608": { lat: 41.8519, long: -87.6698 },
  "60610": { lat: 41.9029, long: -87.6358 },
  "60611": { lat: 41.8929, long: -87.6198 },
  "60614": { lat: 41.9219, long: -87.6498 },
  "60615": { lat: 41.8019, long: -87.5998 },
  "60616": { lat: 41.8419, long: -87.6298 },
  "60618": { lat: 41.9469, long: -87.7028 },
  "60622": { lat: 41.9019, long: -87.6798 },
  "60625": { lat: 41.9719, long: -87.7028 },
  "60626": { lat: 42.0019, long: -87.6698 },
  "60629": { lat: 41.7769, long: -87.7098 },
  "60630": { lat: 41.9669, long: -87.7598 },
  "60631": { lat: 41.9969, long: -87.8098 },
  "60632": { lat: 41.8069, long: -87.7098 },
  "60634": { lat: 41.9469, long: -87.8098 },
  "60638": { lat: 41.7819, long: -87.7798 },
  "60639": { lat: 41.9219, long: -87.7598 },
  "60640": { lat: 41.9719, long: -87.6598 },
  "60641": { lat: 41.9469, long: -87.7498 },
  "60642": { lat: 41.9069, long: -87.6598 },
  "60647": { lat: 41.9219, long: -87.7028 },
  "60651": { lat: 41.9019, long: -87.7398 },
  "60652": { lat: 41.7469, long: -87.7098 },
  "60653": { lat: 41.8169, long: -87.6098 },
  "60654": { lat: 41.8929, long: -87.6358 },
  "60657": { lat: 41.9419, long: -87.6498 },
  "60659": { lat: 41.9919, long: -87.7028 },
  "60660": { lat: 41.9919, long: -87.6598 },
  // Minneapolis area
  "55401": { lat: 44.9778, long: -93.2650 },
  "55402": { lat: 44.9758, long: -93.2720 },
  "55403": { lat: 44.9698, long: -93.2850 },
  "55404": { lat: 44.9628, long: -93.2620 },
  "55405": { lat: 44.9698, long: -93.3020 },
  "55406": { lat: 44.9378, long: -93.2220 },
  "55407": { lat: 44.9278, long: -93.2520 },
  "55408": { lat: 44.9478, long: -93.2920 },
  "55409": { lat: 44.9278, long: -93.2820 },
  "55410": { lat: 44.9178, long: -93.3120 },
  "55411": { lat: 44.9978, long: -93.2920 },
  "55412": { lat: 45.0178, long: -93.2920 },
  "55413": { lat: 44.9978, long: -93.2420 },
  "55414": { lat: 44.9778, long: -93.2220 },
  "55415": { lat: 44.9758, long: -93.2550 },
  "55416": { lat: 44.9478, long: -93.3420 },
  "55417": { lat: 44.9078, long: -93.2220 },
  "55418": { lat: 45.0178, long: -93.2520 },
  "55419": { lat: 44.9078, long: -93.2920 },
  // Default fallback (Madison, WI)
  "default": { lat: 43.0731, long: -89.4012 },
};

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
 * Get coordinates from a ZIP code
 */
function getCoordinatesFromZip(zipCode: string): { lat: number; long: number } {
  // Try exact match first
  if (ZIP_COORDINATES[zipCode]) {
    return ZIP_COORDINATES[zipCode];
  }
  
  // Try to find a nearby ZIP (same first 3 digits)
  const prefix = zipCode.substring(0, 3);
  for (const [zip, coords] of Object.entries(ZIP_COORDINATES)) {
    if (zip.startsWith(prefix)) {
      return coords;
    }
  }
  
  // Return default (Madison, WI)
  return ZIP_COORDINATES["default"];
}

/**
 * Fetch Culver's locations and their Flavor of the Day by ZIP code
 */
export async function getCulversFlavorOfTheDay(
  zipCode: string,
  limit: number = 10
): Promise<CulversLocation[]> {
  try {
    const coords = getCoordinatesFromZip(zipCode);
    
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
      name: location.description,
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
