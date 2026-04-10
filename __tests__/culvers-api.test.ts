/**
 * Culver's Flavor of the Day API Tests
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { fetchCulversFlavorOfTheDay } from "../server/restaurant-scraper";

// Nominatim geocoding response for Madison, WI
const nominatimMadisonResponse = [{ lat: "43.0731", lon: "-89.4012" }];
const nominatimChicagoResponse = [{ lat: "41.8819", lon: "-87.6278" }];

describe("Culver's Flavor of the Day API", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should return flavor data from Culver's API", async () => {
    const mockApiResponse = {
      isSuccessful: true,
      data: {
        geofences: [
          {
            _id: "123",
            description: "Madison, WI - Todd Dr",
            metadata: {
              flavorOfDayName: "OREO® Cookie Cheesecake",
              flavorOfTheDayDescription: "Creamy Cheesecake Fresh Frozen Custard with rich cheesecake pieces.",
              slug: "madison-todd-drive",
              street: "2102 West Beltline Hwy.",
            },
          },
          {
            _id: "456",
            description: "Madison, WI - Northport Dr",
            metadata: {
              flavorOfDayName: "Turtle",
              flavorOfTheDayDescription: "Vanilla fresh frozen custard with caramel.",
              slug: "madison-northport",
              street: "1325 Northport Drive",
            },
          },
        ],
      },
    };

    // First call: Nominatim geocoding, second call: Culver's API
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(nominatimMadisonResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

    const result = await fetchCulversFlavorOfTheDay("53703");

    expect(result).not.toBeNull();
    expect(result?.flavor).toBe("OREO® Cookie Cheesecake");
    expect(result?.description).toContain("Cheesecake");
    expect(result?.locationName).toBe("Madison, WI - Todd Dr");
    expect(result?.address).toBe("2102 West Beltline Hwy.");
    expect(result?.nearbyLocations).toHaveLength(1);
    expect(result?.nearbyLocations?.[0].flavor).toBe("Turtle");
  });

  it("should return null when API fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(nominatimMadisonResponse),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    const result = await fetchCulversFlavorOfTheDay("53703");
    expect(result).toBeNull();
  });

  it("should return null when API returns empty data", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(nominatimMadisonResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          isSuccessful: true,
          data: { geofences: [] },
        }),
      });

    const result = await fetchCulversFlavorOfTheDay("99999");
    expect(result).toBeNull();
  });

  it("should handle network errors gracefully", async () => {
    // Geocoding succeeds but Culver's API throws
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(nominatimMadisonResponse),
      })
      .mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchCulversFlavorOfTheDay("53703");
    expect(result).toBeNull();
  });

  it("should use geocoded coordinates for API call", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(nominatimMadisonResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          isSuccessful: true,
          data: { geofences: [] },
        }),
      });

    // Use a unique zip to avoid geocode cache from prior tests
    await fetchCulversFlavorOfTheDay("53711");

    // The Culver's API call uses the geocoded coordinates
    // Find the call that hits culvers.com (not Nominatim)
    const culversCall = mockFetch.mock.calls.find(
      (c: any) => String(c[0]).includes("culvers.com")
    );
    expect(culversCall).toBeDefined();
    expect(String(culversCall![0])).toContain("lat=43.0731");
    expect(String(culversCall![0])).toContain("long=-89.4012");
  });
});
