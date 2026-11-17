// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Shared in-memory snapshots for useRestaurantStorage().
 *
 * Every screen calls useRestaurantStorage() separately (all tabs stay
 * mounted, plus the detail page), and each call used to keep its own copy of
 * preferences, favorites and personal notes. A change on one screen never
 * reached the others, and a stale screen's next save (or its flush when the app
 * went to the background) wrote its old copy back to storage. Each store here
 * is the single source of truth that every hook instance reads and
 * subscribes to.
 */

import type { Restaurant, UserPreferences } from "@/types/restaurant";

export interface SharedStore<T> {
  /** Latest value any instance has loaded or saved, or null before first load. */
  get(): T | null;
  /** Replace the value and notify every subscribed hook instance. */
  publish(value: T): void;
  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(listener: (value: T) => void): () => void;
  /** Test helper: forget the value and all listeners. */
  reset(): void;
}

export function createSharedStore<T>(): SharedStore<T> {
  let current: T | null = null;
  const listeners = new Set<(value: T) => void>();

  return {
    get: () => current,
    publish(value) {
      current = value;
      listeners.forEach((listener) => listener(value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      current = null;
      listeners.clear();
    },
  };
}

export const preferencesStore = createSharedStore<UserPreferences>();
/** Favorite restaurant snapshots keyed by id. */
export const favoritesStore = createSharedStore<Record<string, Restaurant>>();
/** Private personal notes keyed by restaurant id. */
export const personalNotesStore = createSharedStore<Record<string, string>>();
