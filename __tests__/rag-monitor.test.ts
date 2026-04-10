import { describe, it, expect, vi } from 'vitest';
import { Registry } from 'prom-client';
import { generateMetricsFromQueue } from '../server/rag-monitor';

describe('RAG monitor metrics generator', () => {
  it('generates Prometheus metrics from a fake queue', async () => {
    const fakeQueue = {
      getJobCounts: async (..._args: any[]) => ({ waiting: 2, active: 1, completed: 5, failed: 0, delayed: 0 }),
    } as any;

    const registry = new Registry();
    const update = generateMetricsFromQueue(fakeQueue, registry);

    const metrics = await update();
    expect(typeof metrics).toBe('string');
    expect(metrics).toContain('ragg_jobs_waiting');
    expect(metrics).toContain('ragg_jobs_active');
    expect(metrics).toContain('ragg_jobs_completed');
  });
});