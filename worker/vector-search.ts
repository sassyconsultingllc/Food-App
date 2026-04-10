/**
 * Vector Search Service
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Provides semantic search capabilities using Cloudflare Vectorize
 * for natural language restaurant discovery.
 */

import { VectorizeIndex, Ai } from '@cloudflare/workers-types';
import { D1Database } from '@cloudflare/workers-types';
import { embedQuery, prepareRestaurantVectors, RestaurantEmbeddingInput } from './embeddings';

export interface SemanticSearchResult {
  id: string;
  score: number;
  metadata: Record<string, string>;
}

export interface SemanticSearchOptions {
  query: string;
  topK?: number;
  filter?: {
    cuisineType?: string;
    city?: string;
    country?: string;
    priceRange?: string;
  };
}

export interface SimilarRestaurantOptions {
  restaurantId: string;
  topK?: number;
  excludeIds?: string[];
}

/**
 * Semantic search for restaurants using natural language
 * 
 * Examples:
 * - "Cozy Italian place with romantic atmosphere"
 * - "Late night food that's not fast food"
 * - "Kid-friendly restaurant with outdoor seating"
 * - "Hidden gem with amazing brunch"
 */
export async function semanticSearch(
  vectorize: VectorizeIndex,
  ai: Ai,
  options: SemanticSearchOptions
): Promise<SemanticSearchResult[]> {
  const { query, topK = 10, filter } = options;
  
  try {
    // Generate embedding for the natural language query
    const queryVector = await embedQuery(ai, query);
    
    // Build filter if provided
    const vectorizeFilter: Record<string, string> = {};
    if (filter?.cuisineType) vectorizeFilter.cuisineType = filter.cuisineType;
    if (filter?.city) vectorizeFilter.city = filter.city;
    if (filter?.country) vectorizeFilter.country = filter.country;
    if (filter?.priceRange) vectorizeFilter.priceRange = filter.priceRange;
    
    // Query Vectorize
    const results = await vectorize.query(queryVector, {
      topK,
      filter: Object.keys(vectorizeFilter).length > 0 ? vectorizeFilter : undefined,
      returnMetadata: true,
    });
    
    return results.matches.map(match => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata as Record<string, string>,
    }));
  } catch (error) {
    console.error('[VectorSearch] Semantic search error:', error);
    throw error;
  }
}

/**
 * Find restaurants similar to a given restaurant
 * Great for "More Like This" feature
 */
export async function findSimilar(
  vectorize: VectorizeIndex,
  ai: Ai,
  db: D1Database,
  options: SimilarRestaurantOptions
): Promise<SemanticSearchResult[]> {
  const { restaurantId, topK = 10, excludeIds = [] } = options;
  
  try {
    // Get the source restaurant's vector by ID
    const vectorResult = await vectorize.getByIds([restaurantId]);
    
    if (!vectorResult.length || !vectorResult[0].values) {
      console.warn(`[VectorSearch] No vector found for restaurant: ${restaurantId}`);
      return [];
    }
    
    const sourceVector = vectorResult[0].values;
    
    // Query for similar, requesting extra to account for exclusions
    const results = await vectorize.query(sourceVector, {
      topK: topK + excludeIds.length + 1, // +1 for the source itself
      returnMetadata: true,
    });
    
    // Filter out excluded IDs and the source restaurant
    const allExcluded = new Set([restaurantId, ...excludeIds]);
    
    return results.matches
      .filter(match => !allExcluded.has(match.id))
      .slice(0, topK)
      .map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as Record<string, string>,
      }));
  } catch (error) {
    console.error('[VectorSearch] Find similar error:', error);
    throw error;
  }
}

/**
 * Index restaurants into Vectorize
 * Call this after scraping new restaurants
 */
export async function indexRestaurants(
  vectorize: VectorizeIndex,
  ai: Ai,
  restaurants: RestaurantEmbeddingInput[]
): Promise<{ indexed: number; errors: string[] }> {
  const errors: string[] = [];
  let indexed = 0;
  
  // Process in batches of 100 (Vectorize limit)
  const batchSize = 100;
  
  for (let i = 0; i < restaurants.length; i += batchSize) {
    const batch = restaurants.slice(i, i + batchSize);
    
    try {
      // Generate embeddings for batch
      const vectors = await prepareRestaurantVectors(ai, batch);
      
      // Upsert to Vectorize
      await vectorize.upsert(vectors.map(v => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata,
      })));
      
      indexed += batch.length;
      console.log(`[VectorSearch] Indexed batch ${Math.floor(i / batchSize) + 1}: ${batch.length} restaurants`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VectorSearch] Batch indexing error:`, error);
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errMsg}`);
    }
  }
  
  return { indexed, errors };
}

/**
 * Delete restaurants from the vector index
 */
export async function deleteFromIndex(
  vectorize: VectorizeIndex,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  
  try {
    await vectorize.deleteByIds(ids);
    console.log(`[VectorSearch] Deleted ${ids.length} vectors`);
  } catch (error) {
    console.error('[VectorSearch] Delete error:', error);
    throw error;
  }
}

/**
 * Get vector index statistics
 */
export async function getIndexStats(
  vectorize: VectorizeIndex
): Promise<{ vectorCount: number; dimensions: number }> {
  try {
    const info = await vectorize.describe();
    return {
      // @ts-ignore - Property names may vary between Cloudflare SDK versions
      vectorCount: (info as any).vectorsCount || (info as any).vectorCount || 0,
      // @ts-ignore
      dimensions: (info as any).dimensions || (info as any).config?.dimensions || 768,
    };
  } catch (error) {
    console.error('[VectorSearch] Stats error:', error);
    return { vectorCount: 0, dimensions: 768 };
  }
}

/**
 * Recommend restaurants based on user's favorites
 * Combines multiple favorite vectors to find new recommendations
 */
export async function recommendFromFavorites(
  vectorize: VectorizeIndex,
  ai: Ai,
  favoriteIds: string[],
  options: {
    topK?: number;
    excludeIds?: string[];
  } = {}
): Promise<SemanticSearchResult[]> {
  const { topK = 10, excludeIds = [] } = options;
  
  if (favoriteIds.length === 0) {
    return [];
  }
  
  try {
    // Get vectors for all favorites
    const favoriteVectors = await vectorize.getByIds(favoriteIds);
    
    if (favoriteVectors.length === 0) {
      return [];
    }
    
    // Average the vectors to create a "preference profile"
    const dimensions = favoriteVectors[0].values?.length || 768;
    const avgVector = new Array(dimensions).fill(0);
    
    let validCount = 0;
    for (const fv of favoriteVectors) {
      if (fv.values) {
        for (let i = 0; i < dimensions; i++) {
          avgVector[i] += fv.values[i];
        }
        validCount++;
      }
    }
    
    if (validCount === 0) {
      return [];
    }
    
    // Normalize
    for (let i = 0; i < dimensions; i++) {
      avgVector[i] /= validCount;
    }
    
    // Query with averaged vector
    const results = await vectorize.query(avgVector, {
      topK: topK + favoriteIds.length + excludeIds.length,
      returnMetadata: true,
    });
    
    // Filter out favorites and excluded
    const allExcluded = new Set([...favoriteIds, ...excludeIds]);
    
    return results.matches
      .filter(match => !allExcluded.has(match.id))
      .slice(0, topK)
      .map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as Record<string, string>,
      }));
  } catch (error) {
    console.error('[VectorSearch] Recommendations error:', error);
    throw error;
  }
}

export default {
  semanticSearch,
  findSimilar,
  indexRestaurants,
  deleteFromIndex,
  getIndexStats,
  recommendFromFavorites,
};
