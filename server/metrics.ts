import { Registry, Counter, Histogram, collectDefaultMetrics, Pushgateway } from 'prom-client';
import { ENV } from './_core/env';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

// Optional Pushgateway client
let pushgateway: Pushgateway<any> | undefined;
if (ENV.pushgatewayUrl) {
  try {
    pushgateway = new Pushgateway(ENV.pushgatewayUrl);
    console.log('Pushgateway configured:', ENV.pushgatewayUrl);
  } catch (err) {
    console.warn('Could not configure Pushgateway:', err);
  }
}

export const jobProcessedCounter = new Counter({
  name: 'ragg_job_processed_total',
  help: 'Total number of processed reindex jobs (count of restaurants processed)',
  labelNames: ['job', 'zipCode'] as const,
  registers: [registry],
});

export const jobFailedCounter = new Counter({
  name: 'ragg_job_failed_total',
  help: 'Total number of failed reindex jobs',
  labelNames: ['job', 'zipCode'] as const,
  registers: [registry],
});

export const jobDurationHistogram = new Histogram({
  name: 'ragg_job_duration_seconds',
  help: 'Histogram of reindex job durations in seconds',
  labelNames: ['job', 'zipCode'] as const,
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

// Gauge for queue length (number of enqueued/pending jobs)
import { Gauge } from 'prom-client';
export const queueLengthGauge = new Gauge({
  name: 'ragg_queue_length',
  help: 'Number of jobs currently in the reindex queue',
  labelNames: ['queue'] as const,
  registers: [registry],
});

export function observeQueueLength(queueName: string, length: number) {
  try {
    queueLengthGauge.labels(queueName).set(length);
  } catch (err) {
    // ignore metric errors
  }
}

async function pushMetrics(jobName: string) {
  if (!pushgateway) return;
  try {
    // pushAdd with registry and jobName
    // The Pushgateway API supports pushAdd(registry, jobName, cb)
    await new Promise<void>((resolve, reject) => {
      try {
        // @ts-ignore – signature variations exist across versions
        pushgateway.pushAdd(registry, jobName, (err: Error | null | undefined) => {
          if (err) return reject(err);
          resolve();
        });
      } catch (err) {
        // fallback signature pushAdd({ jobName, groupingKey }, registry, cb)
        try {
          // @ts-ignore
          pushgateway.pushAdd({ jobName }, registry, (err2: Error | null | undefined) => {
            if (err2) return reject(err2);
            resolve();
          });
        } catch (err2) {
          console.warn('Pushgateway.pushAdd failed:', err2);
          resolve();
        }
      }
    });
  } catch (err) {
    console.warn('Error pushing metrics to Pushgateway:', err);
  }
}

/**
 * Push all metrics to Pushgateway immediately (used by admin/manual trigger)
 */
export async function pushAllMetrics(jobName: string = 'manual') {
  await pushMetrics(jobName);
}

export async function observeJobProcessed(jobName: string, zipCode: string, count = 1) {
  jobProcessedCounter.labels(jobName, zipCode).inc(count);
  await pushMetrics(jobName);
}

export async function observeJobFailed(jobName: string, zipCode: string, count = 1) {
  jobFailedCounter.labels(jobName, zipCode).inc(count);
  await pushMetrics(jobName);
}

export async function observeJobDuration(jobName: string, zipCode: string, seconds: number) {
  jobDurationHistogram.labels(jobName, zipCode).observe(seconds);
  await pushMetrics(jobName);
}

export function getRegistry(): Registry {
  return registry;
}

