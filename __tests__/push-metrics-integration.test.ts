import { describe, it, expect } from 'vitest';

const PUSHGW = process.env.PUSHGATEWAY_URL;

if (!PUSHGW) {
  describe.skip('Pushgateway integration', () => {
    it('skipped when PUSHGATEWAY_URL is not set', () => {});
  });
} else {
  describe('Pushgateway integration', () => {
    it('pushes metrics to Pushgateway and they are available', async () => {
      // Import after env is present so metrics module picks up PUSHGATEWAY_URL
      const { pushAllMetrics } = await import('../server/metrics');
      const jobName = `ci-integration-${Date.now()}`;

      await pushAllMetrics(jobName);

      const url = `${PUSHGW.replace(/\/$/, '')}/metrics/job/${encodeURIComponent(jobName)}`;

      // Retry loop for Pushgateway to accept and expose the pushed metrics
      for (let i = 0; i < 20; i++) {
        const res = await fetch(url);
        if (res.status === 200) {
          const text = await res.text();
          expect(text).toContain('ragg_job_processed_total');
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      throw new Error('Metrics not found in Pushgateway after retries');
    }, 20000);
  });
}
