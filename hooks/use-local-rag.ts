/**
 * Local RAG Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * On-device semantic search using simple text matching
 * (Can be upgraded to proper embeddings later)
 */

import { useCallback, useMemo } from "react";
import { Restaurant } from "@/types/restaurant";

interface SearchResult {
  restaurant: Restaurant;
  score: number;
  matchedText: string[];
}

export function useLocalRAG(restaurants: Restaurant[]) {
  // Simple semantic search using keyword matching and sentiment analysis
  const searchRestaurants = useCallback((query: string, limit: number = 5): SearchResult[] => {
    if (!query.trim()) return [];
    
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const results: SearchResult[] = [];
    
    restaurants.forEach(restaurant => {
      let score = 0;
      const matchedText: string[] = [];
      
      // Search in restaurant name
      if (restaurant.name.toLowerCase().includes(query.toLowerCase())) {
        score += 10;
        matchedText.push(restaurant.name);
      }
      
      // Search in cuisine type
      if (restaurant.cuisineType.toLowerCase().includes(query.toLowerCase())) {
        score += 8;
        matchedText.push(restaurant.cuisineType);
      }
      
      // Search in description
      if (restaurant.description?.toLowerCase().includes(query.toLowerCase())) {
        score += 6;
        matchedText.push(restaurant.description);
      }
      
      // Search in review summary
      if (restaurant.reviewSummary?.toLowerCase().includes(query.toLowerCase())) {
        score += 5;
        matchedText.push(restaurant.reviewSummary);
      }
      
      // Search in sentiment highlights
      restaurant.sentiment?.highlights?.forEach(highlight => {
        if (highlight.toLowerCase().includes(query.toLowerCase())) {
          score += 3;
          matchedText.push(highlight);
        }
      });
      
      // Search in menu items (if available)
      restaurant.menu?.popularDishes?.forEach(dish => {
        if (dish.toLowerCase().includes(query.toLowerCase())) {
          score += 4;
          matchedText.push(dish);
        }
      });
      
      // Partial word matching
      queryWords.forEach(word => {
        if (restaurant.name.toLowerCase().includes(word)) {
          score += 2;
          matchedText.push(restaurant.name);
        }
        if (restaurant.cuisineType.toLowerCase().includes(word)) {
          score += 2;
          matchedText.push(restaurant.cuisineType);
        }
        if (restaurant.description?.toLowerCase().includes(word)) {
          score += 1;
          matchedText.push(restaurant.description);
        }
      });
      
      // Bonus for positive sentiment when searching for "good", "best", etc.
      if (["good", "best", "great", "excellent", "amazing"].includes(query.toLowerCase()) && 
          restaurant.sentiment?.score && restaurant.sentiment.score > 0.5) {
        score += restaurant.sentiment.score * 2;
      }
      
      if (score > 0) {
        results.push({
          restaurant,
          score,
          matchedText: [...new Set(matchedText)] // Remove duplicates
        });
      }
    });
    
    // Sort by score and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }, [restaurants]);
  
  // Generate a summary for a restaurant based on available data
  const generateSummary = useCallback((restaurantId: string, query?: string): string => {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    if (!restaurant) return "Restaurant not found";
    
    let summary = `${restaurant.name} is a ${restaurant.cuisineType.toLowerCase()} restaurant`;
    
    if (restaurant.description) {
      summary += ` known for ${restaurant.description.toLowerCase()}`;
    }
    
    if (restaurant.priceRange) {
      const priceDesc = {
        "$": "budget-friendly",
        "$$": "moderately priced", 
        "$$$": "upscale",
        "$$$$": "fine dining"
      }[restaurant.priceRange];
      summary += `. It's ${priceDesc}`;
    }
    
    if (restaurant.sentiment?.summary) {
      summary += `. ${restaurant.sentiment.summary}`;
    }
    
    if (restaurant.menu?.popularDishes?.length) {
      summary += `. Popular dishes include ${restaurant.menu.popularDishes.slice(0, 3).join(", ")}`;
    }
    
    if (restaurant.isCulvers && restaurant.flavorOfTheDay) {
      summary += `. Today's Flavor of the Day is ${restaurant.flavorOfTheDay}: ${restaurant.flavorDescription}`;
    }
    
    return summary;
  }, [restaurants]);
  
  // Get restaurants by cuisine type
  const getByCuisine = useCallback((cuisineType: string, limit: number = 10): Restaurant[] => {
    return restaurants
      .filter(r => r.cuisineType.toLowerCase().includes(cuisineType.toLowerCase()))
      .slice(0, limit);
  }, [restaurants]);
  
  // Get highly rated restaurants
  const getTopRated = useCallback((minRating: number = 4.0, limit: number = 10): Restaurant[] => {
    return restaurants
      .filter(r => r.ratings.aggregated >= minRating)
      .sort((a, b) => b.ratings.aggregated - a.ratings.aggregated)
      .slice(0, limit);
  }, [restaurants]);
  
  // Get Culver's locations with flavor info
  const getCulversLocations = useCallback((): Restaurant[] => {
    return restaurants.filter(r => r.isCulvers);
  }, [restaurants]);
  
  return {
    searchRestaurants,
    generateSummary,
    getByCuisine,
    getTopRated,
    getCulversLocations,
  };
}
