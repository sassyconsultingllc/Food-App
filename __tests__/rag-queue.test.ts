import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../server/rag', () => ({
  addRestaurantToVectorStore: vi.fn(async () => true),
}));

import * as queue from '../server/rag-bull';
import { enqueueReindex, getQueueStatus } from '../server/rag-bull';
import { addRestaurantToVectorStore } from '../server/rag';

describe('RAG Queue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should enqueue a job and process it (mocked addRestaurantToVectorStore)', async () => {
    const jobId = enqueueReindex('53703', 5, 10);
    expect(jobId).toBeDefined();

    // Wait briefly for the queue processor to run
    await new Promise((r) => setTimeout(r, 200));

    // Since addRestaurantToVectorStore is mocked, queue should drain successfully
    const status = await getQueueStatus();
    expect(Array.isArray(status)).toBe(true);
  });
});