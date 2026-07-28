// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-CSN5MR6Q4WPD
/**
 * Hooks Index
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

// Location & GPS
export { useLocation, getDefaultDistanceUnit } from './use-location';

// Restaurant Data
export { useRestaurantStorage } from './use-restaurant-storage';

// AI-Powered Search
export {
  useSemanticSearch,
  useSimilarRestaurants,
  useRecommendations,
  useVectorStats,
} from './use-semantic-search';

// Sound & Haptics
export { useSoundSettings } from './use-sound-settings';

// Spin History
export { useSpinHistory } from './use-spin-history';

// Preferences
export { usePreferences } from './use-preferences';

// tRPC Client
export { trpc, TRPCProvider } from './use-trpc';
