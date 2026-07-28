// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-3BGWX52ZU2ED
import { describe, it, expect } from 'vitest';
import { observeQueueLength, getRegistry } from '../server/metrics';

describe('Queue metrics', () => {
  it('sets ragg_queue_length gauge', async () => {
    observeQueueLength('reindex', 7);

    const metrics = await getRegistry().metrics();
    expect(metrics).toContain('ragg_queue_length');
    expect(metrics).toContain('reindex');
  });
});
