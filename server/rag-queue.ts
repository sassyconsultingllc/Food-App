/**
 * Simple in-memory job queue for reindexing restaurants
 * - Sequential processing
 * - Retry with exponential backoff
 * - Intended as a lightweight fallback when Redis/bull aren't available
 */

import { addRestaurantToVectorStore } from './rag';
import { scrapeRestaurantsByLocation } from './restaurant-scraper';

type ReindexJob = {
  id: string;
  zipCode: string;
  radius: number;
  limit: number;
  attempts: number;
  maxAttempts: number;
  nextRunAt: number;
};

const queue: ReindexJob[] = [];
let processing = false;

function generateId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function enqueueReindex(zipCode: string, radius = 5, limit = 20) {
  const job: ReindexJob = {
    id: generateId(),
    zipCode,
    radius,
    limit,
    attempts: 0,
    maxAttempts: 5,
    nextRunAt: Date.now(),
  };
  queue.push(job);
  processQueue().catch(console.error);
  return job.id;
}

export function getQueueStatus() {
  return queue.map((j) => ({ id: j.id, zipCode: j.zipCode, attempts: j.attempts, nextRunAt: j.nextRunAt }));
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue[0];

    const now = Date.now();
    if (job.nextRunAt > now) {
      // wait until nextRunAt
      await new Promise((r) => setTimeout(r, Math.max(0, job.nextRunAt - now)));
      continue;
    }

    try {
      job.attempts += 1;
      const restaurants = await scrapeRestaurantsByLocation({ zipCode: job.zipCode, radius: job.radius, limit: job.limit });

      await Promise.all(
        restaurants.map((r) =>
          addRestaurantToVectorStore({
            id: r.id,
            name: r.name,
            reviews: [],
            description: r.reviewSummary || '',
            cuisineType: r.cuisineType,
          }),
        ),
      );

      // success - remove job
      queue.shift();
    } catch (err) {
      console.error('Reindex job failed:', err);
      if (job.attempts >= job.maxAttempts) {
        // Give up: remove from queue
        console.error('Max attempts reached for job, dropping:', job.id);
        queue.shift();
      } else {
        // Exponential backoff
        const delay = Math.min(60_000, 2 ** job.attempts * 1000);
        job.nextRunAt = Date.now() + delay;
        // rotate job to end
        queue.push(queue.shift() as ReindexJob);
      }
    }
  }

  processing = false;
}

export function startQueueProcessor() {
  // Ensure processing loop runs
  processQueue().catch(console.error);
}

export function stopQueueProcessor() {
  // noop for now - processor exits after queue drained
}
