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

  // Vectorize - Semantic search index
  VECTORIZE?: VectorizeIndex;
  
  // Workers AI - For generating embeddings
  AI?: Ai;
  
  // API Keys (set via wrangler secret put)
  GOOGLE_PLACES_API_KEY?: string;
  FOURSQUARE_API_KEY?: string;
  HERE_API_KEY?: string;
  
  // App config
  NODE_ENV?: string;
  VITE_APP_ID?: string;
  JWT_SECRET?: string;
  OWNER_OPEN_ID?: string;
}
