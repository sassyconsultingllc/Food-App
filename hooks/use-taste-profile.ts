/**
 * useTasteProfile — Client-side taste profile + cross-locale matching
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Derives a "taste profile" from the user's favorited restaurants:
 *   - cuisine weights (what do they favorite most?)
 *   - price-range preference
 *   - average rating they hold favorites to
 *   - dietary options they favorite (if any)
 *
 * Exposes:
 *   - `profile`: the derived profile object
 *   - `scoreRestaurant(r)`: returns a 0..1 match score for any restaurant
 *   - `matchesTaste(r, threshold?)`: boolean shortcut
 *   - `crossLocaleMatches`: restaurants in `allRestaurants` that:
 *        (a) match the taste profile above threshold
 *        (b) are NOT already favorites
 *        (c) are in a DIFFERENT city/postal code than the user's home
 *     — i.e. "places to try when you visit other cities"
 *
 * All of this is pure client-side computation. No server required.
 * Works offline against whatever the restaurant storage cache holds,
 * so the cross-locale list naturally grows as the user searches new areas.
 */

import { useMemo, useCallback } from "react";
import type { Restaurant } from "@/types/restaurant";
import { calculateDistance } from "@/utils/geo-utils";

/**
 * Distance (in miles) within which a candidate is considered to be in
 * the user's "home locale." A candidate is local if it's within this
 * radius of ANY favorited restaurant. Covers the common case where the
 * home ZIP pulls in 3–5 adjacent small towns (e.g. Sauk City, Prairie
 * du Sac, Mazomanie) that a user would think of as one locale.
 */
const LOCAL_RADIUS_MILES = 25;

export interface TasteProfile {
  /** Cuisine name → weight (sums to 1.0). Empty object if no favorites. */
  cuisineWeights: Record<string, number>;
  /** Price range weights (e.g. `$$`: 0.5). */
  priceWeights: Record<string, number>;
  /** Average aggregated rating across favorites (0 if none). */
  avgRating: number;
  /** Dietary options the user tends to favorite. */
  dietaryPrefs: Set<string>;
  /** Number of favorites used to build this profile. */
  sampleSize: number;
  /** Home city/postalCode the user is anchored to (for locale filtering). */
  homeCity?: string;
  homePostalCode?: string;
  /**
   * Centroid (lat/lng) of the user's favorites. Used to classify any
   * other restaurant as "local" vs "cross-locale" by geographic distance,
   * not string matching on city names.
   */
  favoriteCentroid?: { lat: number; lng: number };
  /**
   * Fraction of favorites that had a specific (non-generic) cuisine tag.
   * 0 = nothing specific, 1 = every favorite had a real cuisine.
   * The scorer uses this to decide how much to trust the cuisine signal
   * vs fall back on price + rating matching.
   */
  cuisineCoverage: number;
}

const EMPTY_PROFILE: TasteProfile = {
  cuisineWeights: {},
  priceWeights: {},
  avgRating: 0,
  dietaryPrefs: new Set(),
  sampleSize: 0,
  cuisineCoverage: 0,
};

/**
 * Cuisine tokens that are too generic to be useful taste signals.
 * These show up from Google Places / Culver's when there's no specific
 * cuisine type — e.g. Google defaults unclassified restaurants to
 * `"Restaurant"`. Without this filter, every "Restaurant" in any locale
 * would score as a 100% match to every "Restaurant" favorite, which turns
 * cross-locale matches into "whatever the first 20 Google results are."
 */
const GENERIC_CUISINE_TOKENS = new Set([
  "restaurant",
  "food",
  "point_of_interest",
  "establishment",
  "place",
  "",
]);

/** Normalize a cuisine string so variants cluster together. */
function normalizeCuisine(c: string | undefined): string {
  if (!c) return "";
  const lower = c.trim().toLowerCase();
  // Treat "Restaurant" / "Food" etc. as no-signal so they never dominate
  // the cuisine weights.
  if (GENERIC_CUISINE_TOKENS.has(lower)) return "";
  return lower;
}

/** Build a taste profile from a set of favorite restaurants. */
export function buildTasteProfile(
  favorites: Restaurant[],
  opts: { homeCity?: string; homePostalCode?: string } = {}
): TasteProfile {
  if (!favorites.length) {
    return { ...EMPTY_PROFILE, ...opts, dietaryPrefs: new Set() };
  }

  const cuisineCounts: Record<string, number> = {};
  const priceCounts: Record<string, number> = {};
  const dietaryPrefs = new Set<string>();
  let ratingSum = 0;
  let ratingCount = 0;
  let latSum = 0;
  let lngSum = 0;
  let coordCount = 0;
  let specificCuisineCount = 0;

  for (const r of favorites) {
    const cuisine = normalizeCuisine(r.cuisineType);
    if (cuisine) {
      cuisineCounts[cuisine] = (cuisineCounts[cuisine] || 0) + 1;
      specificCuisineCount++;
    }
    if (r.priceRange) {
      priceCounts[r.priceRange] = (priceCounts[r.priceRange] || 0) + 1;
    }
    if (r.ratings?.aggregated && r.ratings.aggregated > 0) {
      ratingSum += r.ratings.aggregated;
      ratingCount++;
    }
    if (r.dietaryOptions) {
      for (const d of r.dietaryOptions) dietaryPrefs.add(d);
    }
    if (r.latitude && r.longitude) {
      latSum += r.latitude;
      lngSum += r.longitude;
      coordCount++;
    }
  }

  const favoriteCentroid =
    coordCount > 0
      ? { lat: latSum / coordCount, lng: lngSum / coordCount }
      : undefined;

  const totalCuisine = Object.values(cuisineCounts).reduce((a, b) => a + b, 0) || 1;
  const cuisineWeights: Record<string, number> = {};
  for (const [k, v] of Object.entries(cuisineCounts)) {
    cuisineWeights[k] = v / totalCuisine;
  }

  const totalPrice = Object.values(priceCounts).reduce((a, b) => a + b, 0) || 1;
  const priceWeights: Record<string, number> = {};
  for (const [k, v] of Object.entries(priceCounts)) {
    priceWeights[k] = v / totalPrice;
  }

  return {
    cuisineWeights,
    priceWeights,
    avgRating: ratingCount > 0 ? ratingSum / ratingCount : 0,
    dietaryPrefs,
    sampleSize: favorites.length,
    homeCity: opts.homeCity,
    homePostalCode: opts.homePostalCode,
    favoriteCentroid,
    cuisineCoverage: favorites.length > 0 ? specificCuisineCount / favorites.length : 0,
  };
}

/**
 * Is this restaurant geographically "local" to the user's favorites?
 * True when it's within LOCAL_RADIUS_MILES of the favorites centroid.
 * Falls back to city/zip string matching when coordinates are missing.
 */
function isLocalToProfile(profile: TasteProfile, r: Restaurant): boolean {
  if (profile.favoriteCentroid && r.latitude && r.longitude) {
    const dist = calculateDistance(
      profile.favoriteCentroid.lat,
      profile.favoriteCentroid.lng,
      r.latitude,
      r.longitude
    );
    return dist <= LOCAL_RADIUS_MILES;
  }
  // Fallback: legacy string match
  const home = (profile.homeCity || "").trim().toLowerCase();
  const homeZip = (profile.homePostalCode || "").trim();
  const city = (r.city || "").trim().toLowerCase();
  const zip = (r.zipCode || r.postalCode || "").trim();
  return (!!home && !!city && city === home) || (!!homeZip && !!zip && zip === homeZip);
}

/**
 * Score a single restaurant against a taste profile. Returns a number in
 * [0, 1]. 0 = no match, 1 = perfect match on every signal.
 *
 * Adaptive weighting:
 *   - High cuisine coverage (>= 60% of favorites had a specific cuisine):
 *       cuisine is the dominant signal (50-60% of the score)
 *   - Medium coverage (20-60%):
 *       cuisine still matters but price + rating get more weight
 *   - Low coverage (< 20%):
 *       cuisine is ignored entirely; match on price + rating + dietary
 *
 * This handles the common case where Google Places returns "Restaurant"
 * as the generic type for places it can't categorize specifically — the
 * scorer gracefully falls back to signals that DO have coverage.
 */
export function scoreRestaurant(profile: TasteProfile, r: Restaurant): number {
  if (profile.sampleSize === 0) return 0;

  const cuisine = normalizeCuisine(r.cuisineType);
  const cuisineScore = profile.cuisineWeights[cuisine] || 0;

  const priceScore = r.priceRange
    ? profile.priceWeights[r.priceRange] || 0
    : 0;

  let ratingScore = 0;
  if (profile.avgRating > 0 && r.ratings?.aggregated) {
    const delta = Math.abs(r.ratings.aggregated - profile.avgRating);
    ratingScore = Math.max(0, 1 - delta / 2); // 2.0 star delta → 0 score
  }

  let dietaryScore = 0;
  if (profile.dietaryPrefs.size > 0) {
    const matches = (r.dietaryOptions || []).filter((d) =>
      profile.dietaryPrefs.has(d)
    ).length;
    dietaryScore = matches > 0 ? Math.min(1, matches / profile.dietaryPrefs.size) : 0;
  }

  const hasDietary = profile.dietaryPrefs.size > 0;
  const coverage = profile.cuisineCoverage;

  // Adaptive weights based on how reliable the cuisine profile is.
  let weights: { cuisine: number; price: number; rating: number; dietary: number };
  if (coverage >= 0.6) {
    // High-confidence cuisine profile
    weights = hasDietary
      ? { cuisine: 0.5, price: 0.2, rating: 0.2, dietary: 0.1 }
      : { cuisine: 0.6, price: 0.2, rating: 0.2, dietary: 0 };
  } else if (coverage >= 0.2) {
    // Medium-confidence — cuisine is a tiebreaker, not the main signal
    weights = hasDietary
      ? { cuisine: 0.3, price: 0.3, rating: 0.3, dietary: 0.1 }
      : { cuisine: 0.3, price: 0.35, rating: 0.35, dietary: 0 };
  } else {
    // Low/no cuisine coverage — match purely on vibe (price + rating)
    weights = hasDietary
      ? { cuisine: 0, price: 0.4, rating: 0.45, dietary: 0.15 }
      : { cuisine: 0, price: 0.45, rating: 0.55, dietary: 0 };
  }

  return (
    cuisineScore * weights.cuisine +
    priceScore * weights.price +
    ratingScore * weights.rating +
    dietaryScore * weights.dietary
  );
}

export function matchesTaste(
  profile: TasteProfile,
  r: Restaurant,
  threshold = 0.35
): boolean {
  return scoreRestaurant(profile, r) >= threshold;
}

/** A restaurant annotated with its taste-match score. */
export interface ScoredRestaurant {
  restaurant: Restaurant;
  score: number;
  /** Primary reason this matched, for display. */
  reason: string;
}

function describeMatchReason(profile: TasteProfile, r: Restaurant): string {
  // High-confidence cuisine match wins
  const cuisine = normalizeCuisine(r.cuisineType);
  if (cuisine && profile.cuisineCoverage >= 0.6) {
    const cuisineWeight = profile.cuisineWeights[cuisine] || 0;
    if (cuisineWeight >= 0.25) {
      return `You favorite ${r.cuisineType} spots`;
    }
  }
  // Price-range match
  if (r.priceRange && (profile.priceWeights[r.priceRange] || 0) >= 0.4) {
    return `Matches your usual ${r.priceRange} pick`;
  }
  // Rating-proximity match
  if (profile.avgRating > 0 && r.ratings?.aggregated) {
    const delta = Math.abs(r.ratings.aggregated - profile.avgRating);
    if (delta <= 0.3) {
      return `Rated like your favorites (${r.ratings.aggregated.toFixed(1)}★)`;
    }
  }
  return `Matches your taste`;
}

/**
 * Given a pool of restaurants (everything the app has cached across all the
 * user's searches), return the top N cross-locale matches.
 *
 * "Cross-locale" = NOT in the user's home city/postal code. This surfaces
 * places the user might want to try when they visit or travel.
 */
export function getCrossLocaleMatches(
  profile: TasteProfile,
  pool: Restaurant[],
  favoriteIds: Set<string>,
  opts: { topK?: number; minScore?: number } = {}
): ScoredRestaurant[] {
  const topK = opts.topK ?? 10;
  const minScore = opts.minScore ?? 0.35;

  if (profile.sampleSize === 0 || pool.length === 0) return [];

  const scored: ScoredRestaurant[] = [];
  for (const r of pool) {
    if (favoriteIds.has(r.id)) continue;
    // Skip anything in the user's home radius — by definition those are
    // "in your area", not travel suggestions.
    if (isLocalToProfile(profile, r)) continue;

    const score = scoreRestaurant(profile, r);
    if (score >= minScore) {
      scored.push({
        restaurant: r,
        score,
        reason: describeMatchReason(profile, r),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Same as getCrossLocaleMatches but filters to the user's home locale —
 * for in-area suggestions ("You haven't tried these spots yet").
 */
export function getLocalTasteMatches(
  profile: TasteProfile,
  pool: Restaurant[],
  favoriteIds: Set<string>,
  opts: { topK?: number; minScore?: number } = {}
): ScoredRestaurant[] {
  const topK = opts.topK ?? 10;
  const minScore = opts.minScore ?? 0.35;

  if (profile.sampleSize === 0 || pool.length === 0) return [];

  const scored: ScoredRestaurant[] = [];
  for (const r of pool) {
    if (favoriteIds.has(r.id)) continue;
    if (!isLocalToProfile(profile, r)) continue;

    const score = scoreRestaurant(profile, r);
    if (score >= minScore) {
      scored.push({
        restaurant: r,
        score,
        reason: describeMatchReason(profile, r),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * React hook that plugs into the existing restaurant storage. Pass in the
 * user's favorites, the full (cross-locale) restaurant pool, and the home
 * location; get back a derived profile and pre-computed match lists.
 */
export function useTasteProfile(
  favorites: Restaurant[],
  pool: Restaurant[],
  home: { city?: string; postalCode?: string }
): {
  profile: TasteProfile;
  crossLocaleMatches: ScoredRestaurant[];
  localMatches: ScoredRestaurant[];
  matchesTaste: (r: Restaurant, threshold?: number) => boolean;
  scoreRestaurant: (r: Restaurant) => number;
} {
  const profile = useMemo(
    () =>
      buildTasteProfile(favorites, {
        homeCity: home.city,
        homePostalCode: home.postalCode,
      }),
    [favorites, home.city, home.postalCode]
  );

  const favoriteIds = useMemo(
    () => new Set(favorites.map((f) => f.id)),
    [favorites]
  );

  const crossLocaleMatches = useMemo(
    () => getCrossLocaleMatches(profile, pool, favoriteIds, { topK: 10 }),
    [profile, pool, favoriteIds]
  );

  const localMatches = useMemo(
    () => getLocalTasteMatches(profile, pool, favoriteIds, { topK: 10 }),
    [profile, pool, favoriteIds]
  );

  // Stable callbacks — keyed only on `profile` so they only change when
  // favorites change. Without this, consumers like browse.tsx's FlatList
  // renderRestaurant re-render every card on every keystroke.
  const stableMatchesTaste = useCallback(
    (r: Restaurant, threshold?: number) => matchesTaste(profile, r, threshold),
    [profile]
  );
  const stableScoreRestaurant = useCallback(
    (r: Restaurant) => scoreRestaurant(profile, r),
    [profile]
  );

  return {
    profile,
    crossLocaleMatches,
    localMatches,
    matchesTaste: stableMatchesTaste,
    scoreRestaurant: stableScoreRestaurant,
  };
}
