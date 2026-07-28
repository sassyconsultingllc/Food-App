// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
import { describe, it, expect } from "vitest";
import {
  deriveSearchCenterFromRestaurants,
  pickSearchCenter,
  calculateDistance,
} from "../utils/geo-utils";

describe("deriveSearchCenterFromRestaurants", () => {
  it("returns centroid of restaurants with coordinates", () => {
    const center = deriveSearchCenterFromRestaurants([
      { latitude: 40.0, longitude: -90.0 },
      { latitude: 42.0, longitude: -88.0 },
    ]);
    expect(center).toEqual({ lat: 41, lon: -89 });
  });

  it("returns null when no valid coordinates", () => {
    expect(deriveSearchCenterFromRestaurants([])).toBeNull();
    expect(
      deriveSearchCenterFromRestaurants([{ latitude: NaN, longitude: 0 }])
    ).toBeNull();
  });
});

describe("pickSearchCenter", () => {
  const results = { lat: 41, lon: -89 };
  const geocoded = { lat: 40, lon: -90 };
  const gps = { lat: 37, lon: -122 };

  it("prefers restaurant centroid over geocoded zip and GPS", () => {
    expect(pickSearchCenter(results, geocoded, gps)).toEqual(results);
  });

  it("falls back to geocoded zip then GPS", () => {
    expect(pickSearchCenter(null, geocoded, gps)).toEqual(geocoded);
    expect(pickSearchCenter(null, null, gps)).toEqual(gps);
  });
});

describe("remote zip distance sanity", () => {
  it("nearby filter relative to search center, not GPS", () => {
    // Search center: Chicago (~41.88, -87.63)
    const searchCenter = { lat: 41.8781, lon: -87.6298 };
    // Restaurant 2 mi from search center
    const nearby = { latitude: 41.9, longitude: -87.63 };
    // Device GPS: San Francisco — would wrongly exclude if used as center
    const deviceGps = { lat: 37.7749, lon: -122.4194 };

    const distFromSearch = calculateDistance(
      searchCenter.lat,
      searchCenter.lon,
      nearby.latitude,
      nearby.longitude
    );
    const distFromDevice = calculateDistance(
      deviceGps.lat,
      deviceGps.lon,
      nearby.latitude,
      nearby.longitude
    );

    expect(distFromSearch).toBeLessThan(3);
    expect(distFromDevice).toBeGreaterThan(100);
  });
});
