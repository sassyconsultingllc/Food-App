// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-KQEYEQH7KMOQ
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the rag module before importing the scraper
vi.mock('../server/rag', () => ({
  addRestaurantToVectorStore: vi.fn(async () => true),
}));

import { scrapeRestaurantsByLocation } from '../server/restaurant-scraper';
import { addRestaurantToVectorStore } from '../server/rag';

// Hermetic network: the scraper geocodes via Nominatim and pulls OSM data from
// Overpass when no API keys are set. Hitting the live services made this test
// time out whenever they were slow, so answer them with fixed data instead.
const OSM_ELEMENTS = [
  { type: 'node', id: 1, lat: 43.074, lon: -89.384, tags: { amenity: 'restaurant', name: 'Test Thai House', cuisine: 'thai' } },
  { type: 'node', id: 2, lat: 43.075, lon: -89.388, tags: { amenity: 'restaurant', name: 'Test Taqueria', cuisine: 'mexican' } },
  { type: 'node', id: 3, lat: 43.072, lon: -89.380, tags: { amenity: 'fast_food', name: 'Test Burger Stand', cuisine: 'burger' } },
  { type: 'node', id: 4, lat: 43.078, lon: -89.392, tags: { amenity: 'restaurant', name: 'Test Pizzeria', cuisine: 'pizza' } },
];

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  if (url.includes('nominatim.openstreetmap.org')) {
    return json([{ lat: '43.0731', lon: '-89.4012', address: { country: 'United States', country_code: 'us', city: 'Madison', state: 'Wisconsin' } }]);
  }
  if (url.includes('overpass-api.de')) {
    return json({ elements: OSM_ELEMENTS });
  }
  return json({}, 404);
}

describe('Scraper -> RAG integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should call addRestaurantToVectorStore for each scraped restaurant', async () => {
    const results = await scrapeRestaurantsByLocation({ zipCode: '53703', radius: 5, limit: 10 });

    // Results are capped by limit, but all merged records are indexed to the vector store
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.length).toBeLessThanOrEqual(10);

    // Vector indexing is now batched-and-detached for production (5-concurrent
    // chunks running in the background so the scrape return doesn't block on
    // 50 simultaneous embedding calls). That means by the time
    // scrapeRestaurantsByLocation resolves, only the first chunk has fired.
    // Wait for the background loop to drain by polling the mock call count
    // until it stops growing or hits a sane upper bound.
    await vi.waitFor(
      () => {
        const n = (addRestaurantToVectorStore as any).mock.calls.length;
        // We expect at least `results.length` calls total. results came from
        // results.slice(0, limit) but the indexer runs against the full
        // deduplicated merged set, so callCount can exceed results.length.
        expect(n).toBeGreaterThanOrEqual(results.length);
      },
      { timeout: 5000, interval: 50 }
    );

    // Ensure called with expected shape
    expect((addRestaurantToVectorStore as any).mock.calls[0][0]).toHaveProperty('id');
    expect((addRestaurantToVectorStore as any).mock.calls[0][0]).toHaveProperty('name');
    expect((addRestaurantToVectorStore as any).mock.calls[0][0]).toHaveProperty('reviews');
  }, 20000);
});
