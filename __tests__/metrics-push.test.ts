import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  delete process.env.PUSHGATEWAY_URL; // ensure clean
  vi.restoreAllMocks();
});

describe('Pushgateway integration', () => {
  it('calls Pushgateway.pushAdd when PUSHGATEWAY_URL is set', async () => {
    process.env.PUSHGATEWAY_URL = 'http://localhost:9091';

    // Mock Pushgateway constructor and its pushAdd method before importing metrics
    const prom = await import('prom-client');
    const pushAddMock = vi.fn((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb();
    });

    // Spy on Pushgateway.prototype.pushAdd
    vi.spyOn(prom.Pushgateway.prototype, 'pushAdd').mockImplementation(pushAddMock as any);

    const metrics = await import('../server/metrics');

    // Call observe and expect pushAdd to be called
    await metrics.observeJobProcessed('reindex', '53703', 2);

    expect(pushAddMock).toHaveBeenCalled();
  });
});