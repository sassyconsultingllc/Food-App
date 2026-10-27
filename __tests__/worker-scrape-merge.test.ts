// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshCulversRecords, scrapeRestaurants } from "../worker/scraper";

const MADISON = { lat: 43.0747, lon: -89.3841 };
const RAW_HOURS = '{"MoO":"10:00 AM","MoC":"11:00 PM","TuO":"10:00 AM","TuC":"11:00 PM"}';
const culversGeofence = (flavor: string) => ({
  _id: "store41",
  metadata: {
    city: "Madison", state: "WI", street: "2102 West Beltline Hwy.", postalCode: "53713",
    dineInHours: RAW_HOURS, utcOffset: -5, flavorOfDayName: flavor, flavorOfTheDayDescription: "d",
  },
  geometryCenter: { coordinates: [MADISON.lon, MADISON.lat] },
});
const hereItem = (title: string, lat: number, lng: number, countryCode = "USA") => ({
  id: title, title, position: { lat, lng },
  address: { label: title, countryCode, countryName: "United States" },
  categories: [{ name: "Restaurant" }],
});

function mockFetch(opts: { here: any[]; culversFlavor?: string; fsqStatus?: number }) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: any) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.includes("nominatim")) {
      return json([{ lat: String(MADISON.lat), lon: String(MADISON.lon), address: { country: "United States", country_code: "us", city: "Madison" } }]);
    }
    if (url.includes("hereapi")) return json({ items: opts.here });
    if (url.includes("culvers.com")) {
      return json({ isSuccessful: true, data: { geofences: opts.culversFlavor ? [culversGeofence(opts.culversFlavor)] : [] } });
    }
    if (url.includes("foursquare")) return json({ message: "no credits" }, opts.fsqStatus ?? 200);
    if (url.includes("googleapis")) return json({ status: "REQUEST_DENIED", error_message: "x", results: [] });
    return json({ elements: [] }); // Overpass
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const base = { countryCode: "US", radius: 5, radiusUnit: "miles" as const, limit: 50, hereKey: "h", googleKey: "g", foursquareKey: "f" };

describe("scrapeRestaurants (Worker)", () => {
  it("merges HERE's plain \"Culver's\" into the locator record, keeps flavor, normalizes hours and offset", async () => {
    mockFetch({
      culversFlavor: "Pumpkin Pecan",
      here: [hereItem("Culver's", MADISON.lat + 0.001, MADISON.lon), hereItem("Graze", MADISON.lat, MADISON.lon + 0.002)],
    });
    const out = await scrapeRestaurants({ ...base, postalCode: "53703" });
    const culvers = out.filter((r) => /culver/i.test(r.name));
    expect(culvers).toHaveLength(1);
    expect(culvers[0]).toMatchObject({ id: "culvers_store41", flavorOfTheDay: "Pumpkin Pecan", utcOffsetMinutes: -300 });
    expect(culvers[0].hours?.monday).toBe("10:00 AM - 11:00 PM");
    expect(culvers[0].sources).toEqual(expect.arrayContaining(["here", "culvers"]));
    // HERE's alpha-3 "USA" must come out as "US" or the router's filter drops it.
    expect(out.find((r) => r.name === "Graze")?.countryCode).toBe("US");
  });

  it("drops results far outside the radius and keeps non-Latin names", async () => {
    mockFetch({
      here: [hereItem("IKEA Swedish Restaurant", 55.75, 12.52, "DNK"), hereItem("명동교자", MADISON.lat, MADISON.lon)],
    });
    const out = await scrapeRestaurants({ ...base, postalCode: "53703" });
    expect(out.map((r) => r.name)).toEqual(["명동교자"]);
  });

  it("stops calling Foursquare after it reports no credits", async () => {
    mockFetch({ here: [], fsqStatus: 429 });
    await scrapeRestaurants({ ...base, postalCode: "53703" });
    const calls = mockFetch({ here: [], fsqStatus: 429 });
    await scrapeRestaurants({ ...base, postalCode: "53704" });
    expect(calls.some((u) => u.includes("foursquare"))).toBe(false);
  });
});

describe("refreshCulversRecords", () => {
  it("updates a record cached with yesterday's flavor", async () => {
    mockFetch({ here: [], culversFlavor: "Turtle" });
    const rec: any = {
      id: "culvers_store41", isCulvers: true, latitude: MADISON.lat, longitude: MADISON.lon,
      flavorOfTheDay: "Pumpkin Pecan", flavorDate: "2000-01-01", hours: RAW_HOURS,
    };
    expect(await refreshCulversRecords([rec])).toBe(true);
    expect(rec.flavorOfTheDay).toBe("Turtle");
    expect(rec.hours.monday).toBe("10:00 AM - 11:00 PM");
    expect(await refreshCulversRecords([rec])).toBe(false); // fresh now, no second call
  });
});
