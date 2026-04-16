/**
 * Spin History Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Tracks restaurants the user has been picked by the spinner.
 * Used for the "Exclude Recently Picked" feature.
 */

import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "foodie_finder_spin_history";
const MAX_HISTORY = 100; // Keep last 100 spins

export interface SpinHistoryEntry {
  restaurantId: string;
  restaurantName: string;
  pickedAt: string; // ISO date string
}

export function useSpinHistory() {
  const [history, setHistory] = useState<SpinHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Load history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setHistory(JSON.parse(stored));
        }
      } catch (error) {
        console.error("Error loading spin history:", error);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, []);
  
  // Save history to storage
  const saveHistory = useCallback(async (newHistory: SpinHistoryEntry[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    } catch (error) {
      console.error("Error saving spin history:", error);
    }
  }, []);
  
  // Add a spin to history. Uses functional setState so two rapid spins
  // don't clobber each other via a stale `history` closure.
  const addToHistory = useCallback(async (restaurantId: string, restaurantName: string) => {
    const entry: SpinHistoryEntry = {
      restaurantId,
      restaurantName,
      pickedAt: new Date().toISOString(),
    };

    let persisted: SpinHistoryEntry[] = [];
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, MAX_HISTORY);
      persisted = next;
      return next;
    });
    await saveHistory(persisted);
  }, [saveHistory]);
  
  // Get IDs of restaurants picked within the last N days
  const getRecentlyPickedIds = useCallback((days: number): string[] => {
    if (days === 0) return [];
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return history
      .filter(entry => new Date(entry.pickedAt) >= cutoff)
      .map(entry => entry.restaurantId);
  }, [history]);
  
  // Check if a restaurant was picked within the last N days
  const wasRecentlyPicked = useCallback((restaurantId: string, days: number): boolean => {
    if (days === 0) return false;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return history.some(
      entry => entry.restaurantId === restaurantId && new Date(entry.pickedAt) >= cutoff
    );
  }, [history]);
  
  // Get last N picks
  const getLastPicks = useCallback((count: number): SpinHistoryEntry[] => {
    return history.slice(0, count);
  }, [history]);
  
  // Clear all history
  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);
  
  // Get stats
  const getStats = useCallback(() => {
    if (history.length === 0) {
      return {
        totalSpins: 0,
        uniqueRestaurants: 0,
        mostPicked: null,
        lastPick: null,
      };
    }
    
    const restaurantCounts: Record<string, { name: string; count: number }> = {};
    history.forEach(entry => {
      if (!restaurantCounts[entry.restaurantId]) {
        restaurantCounts[entry.restaurantId] = { name: entry.restaurantName, count: 0 };
      }
      restaurantCounts[entry.restaurantId].count++;
    });
    
    const mostPickedEntry = Object.entries(restaurantCounts)
      .sort(([, a], [, b]) => b.count - a.count)[0];
    
    return {
      totalSpins: history.length,
      uniqueRestaurants: Object.keys(restaurantCounts).length,
      mostPicked: mostPickedEntry ? {
        id: mostPickedEntry[0],
        name: mostPickedEntry[1].name,
        count: mostPickedEntry[1].count,
      } : null,
      lastPick: history[0] || null,
    };
  }, [history]);
  
  return {
    history,
    loading,
    addToHistory,
    getRecentlyPickedIds,
    wasRecentlyPicked,
    getLastPicks,
    clearHistory,
    getStats,
  };
}
