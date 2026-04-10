/**
 * Embedding Service for Semantic Search
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Uses Cloudflare Workers AI to generate embeddings for restaurants
 * and natural language queries for semantic search.
 */

import { Ai } from '@cloudflare/workers-types';

// Using bge-base-en-v1.5 model - 768 dimensions, great for semantic search
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

export interface RestaurantEmbeddingInput {
  id: string;
  name: string;
  cuisineType: string;
  categories?: string[];
  priceRange?: string;
  city?: string;
  country?: string;
  reviewSummary?: string;
  sentiment?: {
    highlights?: string[];
    warnings?: string[];
  };
}

export interface EmbeddingResult {
  id: string;
  values: number[];
  metadata: Record<string, string>;
}

/**
 * Generate a rich text description for embedding
 * This captures the "vibe" of a restaurant for semantic search
 */
export function generateRestaurantText(restaurant: RestaurantEmbeddingInput): string {
  const parts: string[] = [];
  
  // Name and type
  parts.push(`${restaurant.name} is a ${restaurant.cuisineType || 'restaurant'}`);
  
  // Location context
  if (restaurant.city) {
    parts.push(`located in ${restaurant.city}${restaurant.country ? `, ${restaurant.country}` : ''}`);
  }
  
  // Price context
  if (restaurant.priceRange) {
    const priceDesc = {
      '$': 'budget-friendly and affordable',
      '$$': 'moderately priced',
      '$$$': 'upscale dining',
      '$$$$': 'fine dining and luxury',
    }[restaurant.priceRange] || '';
    if (priceDesc) parts.push(priceDesc);
  }
  
  // Categories add richness
  if (restaurant.categories?.length) {
    const cats = restaurant.categories.slice(0, 5).join(', ');
    parts.push(`serving ${cats}`);
  }
  
  // Sentiment highlights capture the vibe
  if (restaurant.sentiment?.highlights?.length) {
    parts.push(`Known for: ${restaurant.sentiment.highlights.slice(0, 5).join(', ')}`);
  }
  
  // Warnings help with negative searches ("not too loud", "avoid slow service")
  if (restaurant.sentiment?.warnings?.length) {
    parts.push(`Some note: ${restaurant.sentiment.warnings.slice(0, 3).join(', ')}`);
  }
  
  // Review summary is gold for semantic matching
  if (restaurant.reviewSummary) {
    parts.push(restaurant.reviewSummary);
  }
  
  return parts.join('. ') + '.';
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(
  ai: Ai,
  text: string
): Promise<number[]> {
  try {
    const response = await ai.run(EMBEDDING_MODEL, {
      text: [text],
    }) as any; // Cloudflare types vary between SDK versions
    
    // Response format varies: { data: [[...numbers]] } or { shape: [...], data: [...] }
    if (response?.data?.[0]) {
      return Array.isArray(response.data[0]) ? response.data[0] : response.data;
    }
    
    throw new Error('No embedding returned from AI');
  } catch (error) {
    console.error('[Embeddings] Generation error:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(
  ai: Ai,
  texts: string[]
): Promise<number[][]> {
  try {
    // Workers AI supports batching
    const response = await ai.run(EMBEDDING_MODEL, {
      text: texts,
    }) as any; // Cloudflare types vary between SDK versions
    
    if (response?.data) {
      return response.data;
    }
    
    throw new Error('No embeddings returned from AI');
  } catch (error) {
    console.error('[Embeddings] Batch generation error:', error);
    throw error;
  }
}

/**
 * Prepare a restaurant for vector indexing
 */
export async function prepareRestaurantVector(
  ai: Ai,
  restaurant: RestaurantEmbeddingInput
): Promise<EmbeddingResult> {
  const text = generateRestaurantText(restaurant);
  const values = await generateEmbedding(ai, text);
  
  return {
    id: restaurant.id,
    values,
    metadata: {
      name: restaurant.name,
      cuisineType: restaurant.cuisineType || 'Restaurant',
      city: restaurant.city || '',
      country: restaurant.country || '',
      priceRange: restaurant.priceRange || '',
    },
  };
}

/**
 * Prepare multiple restaurants for vector indexing (batch)
 */
export async function prepareRestaurantVectors(
  ai: Ai,
  restaurants: RestaurantEmbeddingInput[]
): Promise<EmbeddingResult[]> {
  // Generate texts for all restaurants
  const texts = restaurants.map(generateRestaurantText);
  
  // Batch generate embeddings
  const embeddings = await generateEmbeddings(ai, texts);
  
  // Combine with metadata
  return restaurants.map((restaurant, i) => ({
    id: restaurant.id,
    values: embeddings[i],
    metadata: {
      name: restaurant.name,
      cuisineType: restaurant.cuisineType || 'Restaurant',
      city: restaurant.city || '',
      country: restaurant.country || '',
      priceRange: restaurant.priceRange || '',
    },
  }));
}

/**
 * Generate embedding for a natural language query
 */
export async function embedQuery(
  ai: Ai,
  query: string
): Promise<number[]> {
  // For queries, we can add some context to improve matching
  const enhancedQuery = `Restaurant search: ${query}`;
  return generateEmbedding(ai, enhancedQuery);
}

export default {
  generateRestaurantText,
  generateEmbedding,
  generateEmbeddings,
  prepareRestaurantVector,
  prepareRestaurantVectors,
  embedQuery,
};
