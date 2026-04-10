/**
 * Semantic Search Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * AI-powered natural language restaurant discovery
 */

import { useState, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Restaurant } from '../types/restaurant';

export interface SemanticSearchResult {
  id: string;
  score: number;
  metadata: Record<string, string>;
  restaurant?: Restaurant;
}

export interface UseSemanticSearchOptions {
  topK?: number;
  filter?: {
    cuisineType?: string;
    city?: string;
    country?: string;
    priceRange?: string;
  };
}

/**
 * Hook for AI-powered semantic search
 * 
 * Usage:
 * const { search, results, loading, error } = useSemanticSearch();
 * 
 * // Search with natural language
 * search("Cozy Italian place with romantic vibes");
 * search("Late night food that's not fast food");
 * search("Kid-friendly with outdoor seating");
 */
export function useSemanticSearch(options: UseSemanticSearchOptions = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const searchQuery = trpc.restaurant.semanticSearch.useQuery(
    {
      query,
      topK: options.topK || 10,
      filter: options.filter,
    },
    {
      enabled: query.length >= 3,
    }
  );

  // Update results when data changes
  useEffect(() => {
    if (searchQuery.data) {
      setResults((searchQuery.data.results || []) as SemanticSearchResult[]);
      setError(searchQuery.data.error || null);
    }
    if (searchQuery.error) {
      setError(searchQuery.error.message);
    }
  }, [searchQuery.data, searchQuery.error]);

  const search = useCallback((searchQuery: string) => {
    setError(null);
    setQuery(searchQuery);
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  return {
    search,
    clear,
    results,
    loading: searchQuery.isLoading || searchQuery.isFetching,
    error,
    query,
  };
}

/**
 * Hook for "More Like This" recommendations
 * 
 * Usage:
 * const { findSimilar, results, loading } = useSimilarRestaurants();
 * findSimilar(restaurant.id);
 */
export function useSimilarRestaurants() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [excludeIds, setExcludeIds] = useState<string[]>([]);
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const similarQuery = trpc.restaurant.similar.useQuery(
    {
      restaurantId: restaurantId || '',
      topK: 5,
      excludeIds,
    },
    {
      enabled: !!restaurantId,
    }
  );

  useEffect(() => {
    if (similarQuery.data) {
      setResults((similarQuery.data.results || []) as SemanticSearchResult[]);
      setError(similarQuery.data.error || null);
    }
    if (similarQuery.error) {
      setError(similarQuery.error.message);
    }
  }, [similarQuery.data, similarQuery.error]);

  const findSimilar = useCallback((id: string, exclude: string[] = []) => {
    setRestaurantId(id);
    setExcludeIds(exclude);
  }, []);

  const clear = useCallback(() => {
    setRestaurantId(null);
    setExcludeIds([]);
    setResults([]);
    setError(null);
  }, []);

  return {
    findSimilar,
    clear,
    results,
    loading: similarQuery.isLoading || similarQuery.isFetching,
    error,
  };
}

/**
 * Hook for personalized recommendations based on favorites
 * 
 * Usage:
 * const { getRecommendations, results, loading } = useRecommendations();
 * getRecommendations(favoriteIds);
 */
export function useRecommendations() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [excludeIds, setExcludeIds] = useState<string[]>([]);
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recommendQuery = trpc.restaurant.recommendations.useQuery(
    {
      favoriteIds,
      topK: 10,
      excludeIds,
    },
    {
      enabled: favoriteIds.length > 0,
    }
  );

  useEffect(() => {
    if (recommendQuery.data) {
      setResults((recommendQuery.data.results || []) as SemanticSearchResult[]);
      setError(recommendQuery.data.error || null);
    }
    if (recommendQuery.error) {
      setError(recommendQuery.error.message);
    }
  }, [recommendQuery.data, recommendQuery.error]);

  const getRecommendations = useCallback((favorites: string[], exclude: string[] = []) => {
    setFavoriteIds(favorites);
    setExcludeIds(exclude);
  }, []);

  const clear = useCallback(() => {
    setFavoriteIds([]);
    setExcludeIds([]);
    setResults([]);
    setError(null);
  }, []);

  return {
    getRecommendations,
    clear,
    results,
    loading: recommendQuery.isLoading || recommendQuery.isFetching,
    error,
  };
}

/**
 * Hook to check if semantic search is available
 */
export function useVectorStats() {
  const statsQuery = trpc.restaurant.vectorStats.useQuery();

  return {
    available: statsQuery.data?.available || false,
    vectorCount: statsQuery.data?.vectorCount || 0,
    dimensions: statsQuery.data?.dimensions || 0,
    loading: statsQuery.isLoading,
  };
}

export default {
  useSemanticSearch,
  useSimilarRestaurants,
  useRecommendations,
  useVectorStats,
};
