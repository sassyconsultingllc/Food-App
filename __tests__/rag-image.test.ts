// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-QKCX7IVK4BHR
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as rag from '../server/rag';

vi.mock('../server/_core/env', () => ({
  ENV: { clipApiUrl: '' },
}));

describe('Image ingestion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should fallback to caption embedding when CLIP is not configured', async () => {
    // Spy on embeddings.embedDocuments and collection.add by mocking chroma client getCollection
    const fakeEmbed = vi.spyOn(rag.embeddings, 'embedDocuments').mockResolvedValue([[0.1, 0.2, 0.3]] as any);
    const fakeAdd = vi.fn(async () => true);

    // Replace chroma client getCollection
    (rag as any).chromaClient.getCollection = vi.fn().mockResolvedValue({ add: fakeAdd });

    await rag.addRestaurantImageToVectorStore({
      restaurantId: 'id_img_1',
      restaurantName: 'Test',
      imageUrl: 'https://example.com/photo.jpg',
      caption: 'Delicious burger',
    });

    expect(fakeEmbed).toHaveBeenCalled();
    expect(fakeAdd).toHaveBeenCalled();
  });
});