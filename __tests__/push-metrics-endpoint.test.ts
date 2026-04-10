import { describe, it, expect, vi } from 'vitest';
import { pushAllMetrics } from '../server/metrics';

describe('Admin push endpoint (direct function test)', () => {
  it('pushAllMetrics triggers pushAdd when configured', async () => {
    const prom = await import('prom-client');
    const pushAddMock = vi.fn((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb();
    });

    vi.spyOn(prom.Pushgateway.prototype, 'pushAdd').mockImplementation(pushAddMock as any);

    process.env.PUSHGATEWAY_URL = 'http://localhost:9091';
    // Re-import metrics to pick up env
    const metricsModule = await import('../server/metrics');

    await metricsModule.pushAllMetrics('manual-test');

    expect(pushAddMock).toHaveBeenCalled();
  });
});