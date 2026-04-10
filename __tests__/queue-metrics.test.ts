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
