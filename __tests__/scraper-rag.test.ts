import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the rag module before importing the scraper
vi.mock('../server/rag', () => ({
  addRestaurantToVectorStore: vi.fn(async () => true),
}));

import { scrapeRestaurantsByLocation } from '../server/restaurant-scraper';
import { addRestaurantToVectorStore } from '../server/rag';

describe('Scraper -> RAG integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
