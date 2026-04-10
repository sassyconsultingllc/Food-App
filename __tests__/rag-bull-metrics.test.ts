import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processReindexPayload } from '../server/rag-bull';
import * as rag from '../server/rag';
import { getRegistry } from '../server/metrics';

vi.mock('../server/rag', () => ({
  addRestaurantToVectorStore: vi.fn(async () => true),
}));

describe('RAG Bull job processing (metrics)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes payload and updates job-level metrics', async () => {
    // Mock scraper to return two restaurants
    const fakeRestaurants = [
      { id: 'r1', name: 'A', reviews: [], reviewSummary: 's1', cuisineType: 'X' },
      { id: 'r2', name: 'B', reviews: [], reviewSummary: 's2', cuisineType: 'Y' },
    ];
    const scraper = await import('../server/restaurant-scraper');
    vi.spyOn(scraper, 'scrapeRestaurantsByLocation').mockResolvedValue(fakeRestaurants as any);

    const res = await processReindexPayload({ zipCode: '53703', radius: 5, limit: 10 }, async (p) => {
      // progress callback (noop)
    });

    expect(res.processed).toBe(2);

    const metrics = await getRegistry().metrics();
    expect(metrics).toContain('ragg_job_processed_total');
    expect(metrics).toContain('ragg_job_duration_seconds');
  });
});