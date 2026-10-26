// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Shared in-memory preferences snapshot.
 *
 * useRestaurantStorage() is called separately by every screen (all tabs stay
 * mounted, plus the detail page), and each call used to keep its own copy of
 * the preferences. A zip saved on Settings never reached Home, and the next save
 * from a stale screen wrote its old zip back to storage. This module keeps a
 * single source of truth that every hook instance reads from and subscribes to.
 */

import type { UserPreferences } from "@/types/restaurant";

type Listener = (prefs: UserPreferences) => void;

let current: UserPreferences | null = null;
const listeners = new Set<Listener>();

/** Latest preferences any instance has loaded or saved, or null before first load. */
export function getSharedPreferences(): UserPreferences | null {
  return current;
}

/** Replace the snapshot and notify every subscribed hook instance. */
export function publishPreferences(prefs: UserPreferences): void {
  current = prefs;
  listeners.forEach((listener) => listener(prefs));
}

/** Subscribe to preference changes. Returns an unsubscribe function. */
export function subscribePreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: forget the snapshot and all listeners. */
export function resetPreferencesStore(): void {
  current = null;
  listeners.clear();
}
