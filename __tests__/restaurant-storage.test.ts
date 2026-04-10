/**
 * Restaurant Storage Tests
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { describe, it, expect } from "vitest";
import { calculateDistance, ZIP_CODE_COORDS } from "../utils/geo-utils";

describe("Distance Calculation", () => {
  it("should calculate distance between two points", () => {
    // Madison, WI coordinates
    const lat1 = 43.0731;
    const lon1 = -89.4012;
    const lat2 = 43.0851;
    const lon2 = -89.3752;

    const distance = calculateDistance(lat1, lon1, lat2, lon2);
    
    // Distance should be positive and reasonable (less than 5 miles for nearby points)
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(5);
  });

  it("should return 0 for same coordinates", () => {
    const lat = 43.0731;
    const lon = -89.4012;

    const distance = calculateDistance(lat, lon, lat, lon);
    expect(distance).toBe(0);
  });
});

describe("Zip Code Coordinates", () => {
  it("should export ZIP_CODE_COORDS as an empty legacy map (geocoding is now dynamic)", () => {
    // ZIP_CODE_COORDS is kept as an empty object for backward compatibility.
    // Postal code lookups now use the async geocodePostalCode() function.
    expect(ZIP_CODE_COORDS).toBeDefined();
    expect(typeof ZIP_CODE_COORDS).toBe("object");
    expect(Object.keys(ZIP_CODE_COORDS).length).toBe(0);
  });
});
