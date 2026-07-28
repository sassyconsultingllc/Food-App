// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-T4GTLMCWM3G7
import { describe, it, expect } from 'vitest';
import { observeJobProcessed, observeJobFailed, observeJobDuration, getRegistry } from '../server/metrics';

describe('Metrics module', () => {
  it('records processed, failed and duration metrics', async () => {
    // Record some metrics
    observeJobProcessed('reindex', '53703', 3);
    observeJobFailed('reindex', '53703', 1);
    observeJobDuration('reindex', '53703', 1.23);

    const metrics = await getRegistry().metrics();
    expect(metrics).toContain('ragg_job_processed_total');
    expect(metrics).toContain('ragg_job_failed_total');
    expect(metrics).toContain('ragg_job_duration_seconds_bucket');
  });
});