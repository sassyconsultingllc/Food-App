// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Regression tests for the HERE provider path in worker/scraper.ts, found by
 * the 2026-11-09 live smoke test:
 *  - HERE returns alpha-3 country codes ("USA"); the router compared them to
 *    alpha-2 ("US") and dropped every HERE result whenever Culver's/Google
 *    returned anything, so a Chicago search showed only Culver's.
 *  - address.label repeats the place name ("Kilogram Cafe, 221 W 29th St ...").
 *  - discover has no radius, so far-off matches leaked in.
 *  - caterers / food-production offices / dance clubs carried a secondary
 *    "Restaurant" tag and survived the non-food filter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scrapeRestaurants } from "../worker/scraper";
import { toAlpha2 } from "../worker/country-codes";

const hereItem = (id: string, title: string, primary: string, distance: number, extra: string[] = []) => ({
  id,
  title,
  distance,
  position: { lat: 40.748, lng: -73.993 },
  address: {
    label: `${title}, 221 W 29th St, New York, NY 10001, United States`,
    countryCode: "USA",
    countryName: "United States",
    city: "New York",
    state: "New York",
    postalCode: "10001",
  },
  categories: [{ name: primary }, ...extra.map((name) => ({ name }))],
});

const HERE_ITEMS = [
  hereItem("1", "Kilogram Cafe", "Coffee Shop", 300, ["Restaurant"]),
  hereItem("2", "Bravo Pizza", "Restaurant", 900),
  hereItem("3", "The Catering Company", "Catering & Other Food Services", 400, ["Restaurant"]),
  hereItem("4", "A Marcus Group", "Food Production", 500, ["Restaurant"]),
  hereItem("5", "Mission NYC", "Dancing", 600, ["Restaurant"]),
  hereItem("6", "Far Away Diner", "Restaurant", 50_000),
];

let googleStatus = "REQUEST_DENIED";

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  if (url.includes("nominatim.openstreetmap.org")) {
    return json([{ lat: "40.7506", lon: "-73.9972", address: { country: "United States", country_code: "us", city: "New York", state: "New York" } }]);
  }
  if (url.includes("hereapi.com")) return json({ items: HERE_ITEMS });
  if (url.includes("maps.googleapis.com")) return json({ status: googleStatus, error_message: "test denial", results: [] });
  if (url.includes("overpass")) return json({ elements: [] });
  return json({}, 404);
}

describe("toAlpha2", () => {
  it("maps alpha-3 to alpha-2 and passes alpha-2 through", () => {
    expect(toAlpha2("USA")).toBe("US");
    expect(toAlpha2("deu")).toBe("DE");
    expect(toAlpha2("AUT")).toBe("AT"); // slice(0,2) would have given "AU" (Australia)
    expect(toAlpha2("gb")).toBe("GB");
    expect(toAlpha2("")).toBe("");
    expect(toAlpha2(undefined)).toBe("");
    expect(toAlpha2("ZZZ")).toBe("");
  });
});

describe("worker scraper: HERE provider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes country, strips name from address, enforces radius, drops non-venues", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const results = await scrapeRestaurants({
      postalCode: "10001",
      countryCode: "US",
      radius: 2,
      radiusUnit: "miles",
      limit: 20,
      foursquareKey: "",
      hereKey: "test-here-key",
      googleKey: "test-google-key",
    });

    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["Bravo Pizza", "Kilogram Cafe"]);
    for (const r of results) {
      expect(r.countryCode).toBe("US");
      expect(r.address.startsWith(`${r.name},`)).toBe(false);
    }
    // A non-OK Google status is surfaced instead of a silent "Google: 0".
    expect(errors.mock.calls.some((c) => String(c[0]).includes("Google status REQUEST_DENIED"))).toBe(true);
  });
});
