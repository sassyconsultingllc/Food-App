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
