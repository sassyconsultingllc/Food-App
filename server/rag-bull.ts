/**
 * Bull-backed reindex queue
 * - Uses ENV.redisUrl to connect to Redis
 * - Falls back to the in-memory queue if REDIS not configured
 */

import { ENV } from "./_core/env";
import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { addRestaurantToVectorStore } from "./rag";
import { scrapeRestaurantsByLocation } from "./restaurant-scraper";
import { observeJobProcessed, observeJobFailed, observeJobDuration, observeQueueLength } from './metrics';

// Types
type ReindexPayload = {
  zipCode: string;
  radius: number;
  limit: number;
};

// If REDIS is not configured, reuse the in-memory queue module
let usingBull = false;

let queue: Queue | null = null;
let worker: Worker | null = null;
let scheduler: any | null = null;
let queueMonitorInterval: ReturnType<typeof setInterval> | null = null;

// Minimal in-memory fallback - import existing rag-queue if needed
let fallbackQueue: any = null;
try {
  fallbackQueue = require("./rag-queue");
} catch (err) {
  fallbackQueue = null;
}

function redisConnection() {
  const url = ENV.redisUrl || process.env.REDIS_URL;
  if (!url) return null;
  return new IORedis(url);
}

export async function startQueueProcessor() {
  const conn = redisConnection();
  if (!conn) {
    console.warn('REDIS not configured — using in-memory fallback queue');
    if (fallbackQueue && fallbackQueue.startQueueProcessor) {
      fallbackQueue.startQueueProcessor();
    }
    return;
  }

  usingBull = true;

  queue = new Queue('reindex', { connection: conn as any });
  // QueueScheduler may not be available in some bullmq type setups — import dynamically
  try {
    const bullmq: any = await import('bullmq');
    if (bullmq && bullmq.QueueScheduler) {
      scheduler = new bullmq.QueueScheduler('reindex', { connection: conn as any });
    } else {
      scheduler = null;
    }
  } catch (err) {
    scheduler = null;
  }

  // Start periodic poll to monitor queue length
  try {
    const setQueueLength = async () => {
      try {
        const counts = await queue!.getJobCounts();
        // sum waiting, delayed, active as pending work
        const total = (counts.waiting || 0) + (counts.delayed || 0) + (counts.active || 0);
        observeQueueLength('reindex', total);
      } catch (e) {
        // ignore
      }
    };

    // Set initial queue length and then poll every 10s
    await setQueueLength();
    queueMonitorInterval = setInterval(setQueueLength, 10000);
  } catch (e) {
    // ignore
  }

  worker = new Worker(
    'reindex',
    async (job: Job<ReindexPayload>) => {
      // Use exportable process function so it can be unit-tested
      const result = await processReindexPayload(job.data, async (progress) => {
        try {
          job.updateProgress(progress);
        } catch (e) {
          // ignore
        }
      });

      return result;
    },
    { connection: conn as any, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
    try {
      const zipCode = (job && job.data && (job.data as any).zipCode) || 'unknown';
      observeJobFailed('reindex', zipCode, 1);
    } catch (e) {
      // ignore
    }
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  console.log('Bull queue processor started (reindex)');
}

export async function stopQueueProcessor() {
  try {
    usingBull = false;
    if (queueMonitorInterval) {
      clearInterval(queueMonitorInterval);
      queueMonitorInterval = null;
    }
    await worker?.close();
    await scheduler?.close();
    await queue?.close();
  } catch (err) {
    console.warn('Error shutting down Bull queue:', err);
  }
}

export async function enqueueReindex(zipCode: string, radius = 5, limit = 20) {
  const payload: ReindexPayload = { zipCode, radius, limit };
  const conn = redisConnection();
  if (!conn) {
    if (fallbackQueue && fallbackQueue.enqueueReindex) return fallbackQueue.enqueueReindex(zipCode, radius, limit);
    // last resort: run immediately
    const restaurants = await scrapeRestaurantsByLocation({ zipCode, radius, limit });
    await Promise.all(
      restaurants.map((r) =>
        addRestaurantToVectorStore({ id: r.id, name: r.name, reviews: [], description: r.reviewSummary || '', cuisineType: r.cuisineType }),
      ),
    );
    return 'inline';
  }

  if (!queue) {
    queue = new Queue('reindex', { connection: conn as any });
  }

  const job = await queue.add('reindex-job', payload, {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });

  try {
    const counts = await queue.getJobCounts();
    const total = (counts.waiting || 0) + (counts.delayed || 0) + (counts.active || 0);
    observeQueueLength('reindex', total);
  } catch (e) {
    // ignore
  }

  return job.id;
}

export async function getQueueStatus() {
  const conn = redisConnection();
  if (!conn) {
    if (fallbackQueue && fallbackQueue.getQueueStatus) return fallbackQueue.getQueueStatus();
    return [];
  }

  if (!queue) queue = new Queue('reindex', { connection: conn as any });

  const waiting = await queue.getJobs(['waiting', 'active', 'delayed', 'failed', 'completed'], 0, 50);
  return waiting.map((j) => ({ id: j.id, name: j.name, data: j.data, attemptsMade: j.attemptsMade, progress: j.progress }));
}

export async function getReindexQueue(): Promise<Queue | null> {
  return queue;
}

/**
 * Process a reindex payload (extracted for unit testing and metrics)
 */
export async function processReindexPayload(
  payload: ReindexPayload,
  progressCb?: (progress: number) => Promise<void> | void,
) {
  const start = Date.now();
  try {
    const restaurants = await scrapeRestaurantsByLocation({ zipCode: payload.zipCode, radius: payload.radius, limit: payload.limit });
    let idx = 0;
    for (const r of restaurants) {
      await addRestaurantToVectorStore({ id: r.id, name: r.name, reviews: [], description: r.reviewSummary || '', cuisineType: r.cuisineType });
      idx += 1;
      if (progressCb) {
        await progressCb(Math.round((idx / restaurants.length) * 100));
      }
    }

    const durationSeconds = (Date.now() - start) / 1000;
    observeJobProcessed('reindex', payload.zipCode, restaurants.length);
    observeJobDuration('reindex', payload.zipCode, durationSeconds);

    return { processed: restaurants.length };
  } catch (err) {
    const durationSeconds = (Date.now() - start) / 1000;
    observeJobFailed('reindex', payload.zipCode, 1);
    observeJobDuration('reindex', payload.zipCode, durationSeconds);
    throw err;
  }
}

export { usingBull };
