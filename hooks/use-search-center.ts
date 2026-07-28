// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Search-center coordinates for distance display and filters.
 * Prefers the active search area (restaurant centroid or geocoded zip)
 * over device GPS so remote zip searches sort/filter correctly.
 */

import { useEffect, useMemo, useState } from "react";

import {
  deriveSearchCenterFromRestaurants,
  geocodePostalCode,
  pickSearchCenter,
  type LatLon,
} from "@/utils/geo-utils";
import type { Restaurant } from "@/types/restaurant";

export function useSearchCenterCoords(
  restaurants: Restaurant[],
  zipCode: string,
  options?: {
    countryCode?: string;
    gpsCoords?: LatLon | null;
    /** When false, skip restaurant centroid (e.g. while a new zip search is in flight). */
    trustRestaurants?: boolean;
  }
): LatLon | null {
  const trustRestaurants = options?.trustRestaurants !== false;

  const fromRestaurants = useMemo(
    () =>
      trustRestaurants ? deriveSearchCenterFromRestaurants(restaurants) : null,
    [restaurants, trustRestaurants]
  );

  const [geocodedZip, setGeocodedZip] = useState<LatLon | null>(null);

  // Only geocode when results aren't loaded yet — geocodePostalCode caches hits.
  useEffect(() => {
    if (fromRestaurants) {
      setGeocodedZip(null);
      return;
    }

    const zip = zipCode.trim();
    if (zip.length < 2) {
      setGeocodedZip(null);
      return;
    }

    let cancelled = false;
    geocodePostalCode(zip, options?.countryCode).then((loc) => {
      if (cancelled) return;
      if (loc?.coordinates) {
        setGeocodedZip({
          lat: loc.coordinates.lat,
          lon: loc.coordinates.lng,
        });
      } else {
        setGeocodedZip(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fromRestaurants, zipCode, options?.countryCode]);

  return useMemo(
    () => pickSearchCenter(fromRestaurants, geocodedZip, options?.gpsCoords ?? null),
    [fromRestaurants, geocodedZip, options?.gpsCoords]
  );
}

export default useSearchCenterCoords;
