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

    // The scraper indexes ALL deduplicated records (before limit slicing) to the vector store
    const callCount = (addRestaurantToVectorStore as any).mock.calls.length;
    expect(callCount).toBeGreaterThanOrEqual(results.length);

    // Ensure called with expected shape
    expect((addRestaurantToVectorStore as any).mock.calls[0][0]).toHaveProperty('id');
    expect((addRestaurantToVectorStore as any).mock.calls[0][0]).toHaveProperty('name');
    expect((addRestaurantToVectorStore as any).mock.calls[0][0]).toHaveProperty('reviews');
  }, 15000);
});
