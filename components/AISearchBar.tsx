/**
 * AI Search Bar Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Natural language restaurant discovery powered by AI
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSemanticSearch, SemanticSearchResult } from '../hooks/use-semantic-search';
import { Restaurant } from '../types/restaurant';

interface AISearchBarProps {
  onResultSelect?: (restaurant: Restaurant) => void;
  placeholder?: string;
  showSuggestions?: boolean;
}

// Example queries to inspire users
const EXAMPLE_QUERIES = [
  "Cozy Italian with romantic vibes",
  "Kid-friendly with outdoor seating",
  "Late night food that's not fast food",
  "Hidden gem with amazing brunch",
  "Healthy options that taste good",
  "Best tacos in the area",
  "Date night spot with great cocktails",
  "Quick lunch under $15",
];

export function AISearchBar({
  onResultSelect,
  placeholder = "Describe what you're craving...",
  showSuggestions = true,
}: AISearchBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [showExamples, setShowExamples] = useState(false);
  
  const { search, results, loading, error, clear } = useSemanticSearch({
    topK: 10,
  });

  // Animation for the AI sparkle
  const sparkleRotation = useSharedValue(0);
  const sparkleScale = useSharedValue(1);

  const animatedSparkleStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${sparkleRotation.value}deg` },
      { scale: sparkleScale.value },
    ],
  }));

  const handleSearch = useCallback(() => {
    if (inputValue.trim().length < 3) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Animate the sparkle
    sparkleRotation.value = withRepeat(
      withSequence(
        withTiming(15, { duration: 100 }),
        withTiming(-15, { duration: 100 }),
        withTiming(0, { duration: 100 })
      ),
      3
    );
    sparkleScale.value = withSequence(
      withSpring(1.2),
      withSpring(1)
    );
    
    search(inputValue.trim());
    setShowExamples(false);
  }, [inputValue, search]);

  const handleExamplePress = useCallback((example: string) => {
    setInputValue(example);
    setShowExamples(false);
    Haptics.selectionAsync();
    
    // Auto-search after a brief delay
    setTimeout(() => {
      search(example);
    }, 100);
  }, [search]);

  const handleResultPress = useCallback((result: SemanticSearchResult) => {
    if (result.restaurant && onResultSelect) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onResultSelect(result.restaurant);
    }
  }, [onResultSelect]);

  const handleClear = useCallback(() => {
    setInputValue('');
    clear();
  }, [clear]);

  const renderResult = useCallback(({ item }: { item: SemanticSearchResult }) => (
    <Pressable
      style={({ pressed }) => [
        styles.resultItem,
        pressed && styles.resultItemPressed,
      ]}
      onPress={() => handleResultPress(item)}
    >
      <View style={styles.resultContent}>
        <Text style={styles.resultName} numberOfLines={1}>
          {item.restaurant?.name || item.metadata.name}
        </Text>
        <Text style={styles.resultMeta} numberOfLines={1}>
          {item.metadata.cuisineType}
          {item.metadata.priceRange && ` • ${item.metadata.priceRange}`}
          {item.metadata.city && ` • ${item.metadata.city}`}
        </Text>
      </View>
      <View style={styles.scoreContainer}>
        <Text style={styles.scoreText}>{Math.round(item.score * 100)}%</Text>
        <Text style={styles.matchText}>match</Text>
      </View>
    </Pressable>
  ), [handleResultPress]);

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.inputContainer}>
        <Animated.View style={animatedSparkleStyle}>
          <Ionicons name="sparkles" size={20} color="#F59E0B" />
        </Animated.View>
        
        <TextInput
          style={styles.input}
          value={inputValue}
          onChangeText={setInputValue}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          onFocus={() => setShowExamples(true)}
        />
        
        {inputValue.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          onPress={handleSearch}
          style={[styles.searchButton, loading && styles.searchButtonLoading]}
          disabled={loading || inputValue.trim().length < 3}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="search" size={18} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      {/* AI Badge */}
      <View style={styles.aiBadge}>
        <Ionicons name="hardware-chip-outline" size={12} color="#8B5CF6" />
        <Text style={styles.aiBadgeText}>AI-Powered Search</Text>
      </View>

      {/* Example Queries */}
      {showExamples && showSuggestions && inputValue.length === 0 && (
        <View style={styles.examplesContainer}>
          <Text style={styles.examplesTitle}>Try searching for:</Text>
          <View style={styles.exampleChips}>
            {EXAMPLE_QUERIES.slice(0, 4).map((example, index) => (
              <TouchableOpacity
                key={index}
                style={styles.exampleChip}
                onPress={() => handleExamplePress(example)}
              >
                <Text style={styles.exampleChipText}>{example}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Results */}
      {results.length > 0 && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>
            Found {results.length} matches
          </Text>
          <FlatList
            data={results}
            renderItem={renderResult}
            keyExtractor={(item) => item.id}
            style={styles.resultsList}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  input: {
    flex: 1,
    color: '#F9FAFB',
    fontSize: 16,
    marginLeft: 8,
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
  },
  searchButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    padding: 10,
    marginLeft: 8,
  },
  searchButtonLoading: {
    backgroundColor: '#D97706',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  aiBadgeText: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '500',
  },
  examplesContainer: {
    marginTop: 16,
  },
  examplesTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 8,
  },
  exampleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exampleChip: {
    backgroundColor: '#374151',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  exampleChipText: {
    color: '#D1D5DB',
    fontSize: 13,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    flex: 1,
  },
  resultsContainer: {
    marginTop: 16,
  },
  resultsTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 8,
  },
  resultsList: {
    maxHeight: 300,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  resultItemPressed: {
    backgroundColor: '#374151',
  },
  resultContent: {
    flex: 1,
  },
  resultName: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '600',
  },
  resultMeta: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  scoreContainer: {
    alignItems: 'center',
    marginLeft: 12,
  },
  scoreText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '700',
  },
  matchText: {
    color: '#6B7280',
    fontSize: 10,
  },
});

export default AISearchBar;
