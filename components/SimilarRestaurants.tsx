/**
 * Similar Restaurants Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * "More Like This" AI-powered recommendations
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSimilarRestaurants, useRecommendations } from '../hooks/use-semantic-search';
import { Restaurant } from '../types/restaurant';

interface SimilarRestaurantsProps {
  restaurant: Restaurant;
  onSelect?: (restaurant: Restaurant) => void;
  excludeIds?: string[];
  maxResults?: number;
}

export function SimilarRestaurants({
  restaurant,
  onSelect,
  excludeIds = [],
  maxResults = 5,
}: SimilarRestaurantsProps) {
  const { findSimilar, results, loading, error, clear } = useSimilarRestaurants();

  useEffect(() => {
    if (restaurant?.id) {
      findSimilar(restaurant.id, excludeIds);
    }
    return () => clear();
  }, [restaurant?.id, excludeIds.join(',')]);

  const handlePress = (item: any) => {
    if (item.restaurant && onSelect) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(item.restaurant);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="sparkles" size={16} color="#F59E0B" />
          <Text style={styles.title}>Finding similar...</Text>
        </View>
        <ActivityIndicator size="small" color="#F59E0B" style={styles.loader} />
      </View>
    );
  }

  if (error || results.length === 0) {
    return null; // Silently hide if no results
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color="#F59E0B" />
        <Text style={styles.title}>More Like This</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {results.slice(0, maxResults).map((item: any) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            onPress={() => handlePress(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.cardName} numberOfLines={1}>
              {item.restaurant?.name || item.metadata.name}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.metadata.cuisineType}
            </Text>
            <View style={styles.matchBadge}>
              <Text style={styles.matchText}>
                {Math.round(item.score * 100)}% match
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

interface RecommendationsProps {
  favoriteIds: string[];
  onSelect?: (restaurant: Restaurant) => void;
  excludeIds?: string[];
  title?: string;
}

export function PersonalizedRecommendations({
  favoriteIds,
  onSelect,
  excludeIds = [],
  title = "Recommended For You",
}: RecommendationsProps) {
  const { getRecommendations, results, loading, clear } = useRecommendations();

  useEffect(() => {
    if (favoriteIds.length === 0) {
      clear();
      return;
    }
    getRecommendations(favoriteIds, [...favoriteIds, ...excludeIds]);
    return () => clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteIds.join(','), excludeIds.join(',')]);

  const recommendations = results as any[];

  if (favoriteIds.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="restaurant" size={16} color="#EC4899" />
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Add some favorites to get personalized recommendations!
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="bulb" size={16} color="#F59E0B" />
          <Text style={styles.title}>Finding recommendations...</Text>
        </View>
        <ActivityIndicator size="small" color="#F59E0B" style={styles.loader} />
      </View>
    );
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="bulb" size={16} color="#F59E0B" />
        <Text style={styles.title}>{title}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {recommendations.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            onPress={() => {
              if (item.restaurant && onSelect) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(item.restaurant);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.cardName} numberOfLines={1}>
              {item.restaurant?.name || item.metadata.name}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.metadata.cuisineType}
            </Text>
            <View style={[styles.matchBadge, styles.recommendBadge]}>
              <Ionicons name="star" size={10} color="#F59E0B" />
              <Text style={styles.matchText}>For you</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '600',
  },
  loader: {
    marginVertical: 20,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 10,
  },
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    width: 160,
    borderWidth: 1,
    borderColor: '#374151',
  },
  cardName: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 8,
  },
  matchBadge: {
    backgroundColor: '#065F46',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recommendBadge: {
    backgroundColor: '#78350F',
  },
  matchText: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '500',
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default SimilarRestaurants;
