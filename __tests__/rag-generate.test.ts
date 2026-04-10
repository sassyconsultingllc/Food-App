import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as llmModule from '../server/_core/llm';
import * as ragModule from '../server/rag';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RAG generateRestaurantSummary', () => {
  it('should call queryRestaurantRAG and invokeLLM and return LLM content', async () => {
    // Spy on queryRestaurantRAG to return mock docs
    vi.spyOn(ragModule, 'queryRestaurantRAG').mockResolvedValue({
      documents: ['Great food', 'Friendly staff'],
      metadatas: [{ restaurantId: 'id_1' }, { restaurantId: 'id_1' }],
      distances: [0.01, 0.05],
    } as any);

    // Mock invokeLLM to return a predictable response
    vi.spyOn(llmModule, 'invokeLLM').mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Mock summary from LLM',
          },
        },
      ],
    } as any);

    // Call the test-friendly wrapper injecting a fake fetcher
    const fakeFetcher = vi.fn().mockResolvedValue({ documents: ['Great food', 'Friendly staff'], metadatas: [{}, {}], distances: [0.01, 0.05] });

    const summary = await ragModule.generateRestaurantSummaryWithFetcher('What do people say about service?', 'id_1', fakeFetcher);

    expect(summary).toBe('Mock summary from LLM');
    expect(fakeFetcher).toHaveBeenCalledWith('What do people say about service?', 'id_1', 10);
    expect(llmModule.invokeLLM).toHaveBeenCalled();
  });
});