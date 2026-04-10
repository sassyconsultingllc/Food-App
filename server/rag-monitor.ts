import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Registry, Gauge, collectDefaultMetrics } from 'prom-client';
import type { Queue } from 'bullmq';
import { getReindexQueue } from './rag-bull';

let metricsInterval: ReturnType<typeof setInterval> | null = null;

import { getRegistry } from './metrics';

export function generateMetricsFromQueue(queue: Queue, registry?: Registry) {
  const reg = registry || getRegistry();

  const waitingGauge = new Gauge({ name: 'ragg_jobs_waiting', help: 'Jobs waiting', registers: [reg] });
  const activeGauge = new Gauge({ name: 'ragg_jobs_active', help: 'Jobs active', registers: [reg] });
  const completedGauge = new Gauge({ name: 'ragg_jobs_completed', help: 'Jobs completed', registers: [reg] });
  const failedGauge = new Gauge({ name: 'ragg_jobs_failed', help: 'Jobs failed', registers: [reg] });
  const delayedGauge = new Gauge({ name: 'ragg_jobs_delayed', help: 'Jobs delayed', registers: [reg] });

  return async function update() {
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      waitingGauge.set(counts.waiting || 0);
      activeGauge.set(counts.active || 0);
      completedGauge.set(counts.completed || 0);
      failedGauge.set(counts.failed || 0);
      delayedGauge.set(counts.delayed || 0);
      return reg.metrics();
    } catch (err) {
      console.error('Error generating metrics from queue:', err);
      return reg.metrics();
    }
  };
}

export async function initRagMonitor(app: express.Application) {
  const queue = await getReindexQueue();
  if (queue) {
    try {
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/admin/queues');
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      // No auth required for admin UI in this build — mount Bull Board without auth
      app.use('/admin/queues', serverAdapter.getRouter());

      console.log('Bull Board mounted at /admin/queues');

      const update = generateMetricsFromQueue(queue);
      // Update metrics every 10s
      metricsInterval = setInterval(update, 10_000);

      app.get('/metrics', async (_req, res) => {
        try {
          const metrics = await update();
          res.set('Content-Type', 'text/plain; version=0.0.4');
          res.send(metrics);
        } catch (err) {
          res.status(500).send('Metrics error');
        }
      });

      console.log('RAG monitor initialized (/metrics)');
    } catch (err) {
      console.warn('Could not initialize RAG monitor:', err);
    }
  } else {
    console.log('No reindex queue available; skipping RAG monitor');
  }
}

export function stopRagMonitor() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}
