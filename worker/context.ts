/**
 * Worker Environment Types
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { D1Database, VectorizeIndex, Ai, R2Bucket, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  // D1 Database - Structured data storage
  DB?: D1Database;

  // R2 Buckets
  MENU_PHOTOS?: R2Bucket;

  // KV Namespaces
  RATE_LIMIT?: KVNamespace;
  FOODIE_PUBLIC_NOTES?: KVNamespace;
  // Optional: dedicated namespace for vision-classification results. If
  // absent the vision endpoint falls back to RATE_LIMIT for backward
  // compatibility, but mixing them risks rate-limit keys getting evicted
  // by high-traffic vision caching. Provision via:
  //   wrangler kv:namespace create VISION_CACHE
  // then add the ID to wrangler.toml under [[kv_namespaces]].
  VISION_CACHE?: KVNamespace;

  // Vectorize - Semantic search index
  VECTORIZE?: VectorizeIndex;
  
  // Workers AI - For generating embeddings
  AI?: Ai;
  
  // API Keys (set via wrangler secret put)
  GOOGLE_PLACES_API_KEY?: string;
  FOURSQUARE_API_KEY?: string;
  HERE_API_KEY?: string;

  // Anonymous community content: HMAC pepper for restaurant bucket IDs AND for
  // salting rate-limit IP keys (so the raw IP is never stored/logged). Set via:
  //   wrangler secret put RESTAURANT_BUCKET_PEPPER
  // NEVER commit it or ship it to the client. See worker/restaurant-bucket.ts.
  RESTAURANT_BUCKET_PEPPER?: string;
  
  // App config
  NODE_ENV?: string;
  VITE_APP_ID?: string;
  JWT_SECRET?: string;
  OWNER_OPEN_ID?: string;
}
