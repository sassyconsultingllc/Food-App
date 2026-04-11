/**
 * Restaurant Data Types
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

export interface DailySpecial {
  title: string;
  description: string;
  validDate: string;
}

export interface RestaurantRatings {
  // Legacy sources (kept for backward compatibility)
  yelp?: number;
  yelpReviewCount?: number;
  facebook?: number;
  facebookReviewCount?: number;
  google?: number;
  googleReviewCount?: number;
  website?: number;
  
  // New multi-source aggregation
  foursquare?: number;
  foursquareReviewCount?: number;
  here?: number;
  hereReviewCount?: number;
  
  // Computed aggregate
  aggregated: number;
  totalReviews: number;
}

export interface HoursOfOperation {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}

export interface OrderingOptions {
  phone?: string;
  directUrl?: string;
  doordash?: string;
  ubereats?: string;
  grubhub?: string;
  postmates?: string;
}

export interface ReservationOptions {
  opentable?: string;
  resy?: string;
  yelp?: string;
  direct?: string;
}

export interface MenuInfo {
  url?: string;
  facebookMenu?: string;
  pdfUrl?: string;
  popularDishes?: string[];
}

export interface Restaurant {
  id: string;
  name: string;
  cuisineType: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;           // Legacy alias for postalCode
  postalCode?: string;       // International postal code
  country?: string;          // Country name (e.g., "United States", "United Kingdom")
  countryCode?: string;      // ISO 3166-1 alpha-2 (e.g., "US", "GB", "AU")
  latitude: number;
  longitude: number;
  
  // Contact & Links
  phone?: string;
  website?: string;
  facebookUrl?: string;
  yelpUrl?: string;
  googleMapsUrl?: string;
  
  // Delivery service URLs (generated search links)
  doordashUrl?: string;
  ubereatsUrl?: string;
  grubhubUrl?: string;
  
  // Culvers specific
  isCulvers: boolean;
  flavorOfTheDay?: string;
  flavorDescription?: string;
  
  // Specials
  dailySpecial?: DailySpecial;
  
  // Ratings (aggregated from multiple sources)
  ratings: RestaurantRatings;
  
  // Menu & Ordering
  menu?: MenuInfo;
  ordering?: OrderingOptions;
  reservations?: ReservationOptions;
  
  // Additional Info
  priceRange?: "$" | "$$" | "$$$" | "$$$$";
  hours?: HoursOfOperation;
  parkingInfo?: string;
  description?: string;
  imageUrl?: string;
  photos?: string[];
  categories?: string[]; // e.g., ["italian", "pizza", "restaurant"]
  
  // Dietary options
  dietaryOptions?: DietaryOption[];
  
  // Runtime calculated
  distance?: number;
  
  // Data freshness
  lastUpdated?: string;
  dataSources?: string[];
  
  // Sentiment analysis
  sentiment?: {
    score: number;
    sentiment: "positive" | "negative" | "mixed" | "neutral";
    summary: string;
    highlights: string[];
    warnings: string[];
  };
  reviewSummary?: string;
}

export interface UserPreferences {
  defaultZipCode: string;        // Legacy - use defaultPostalCode
  defaultPostalCode?: string;    // International postal code
  defaultCountryCode?: string;   // ISO country code
  defaultRadius: number;
  defaultRadiusUnit?: 'miles' | 'km';  // km for most countries, miles for US/UK
  favorites: string[];
  displayName?: string;          // Local-only profile name
  profilePhotoUri?: string;      // Local file:// URI to user-picked profile picture
}

export interface FilterOptions {
  maxDistance: number;
  distanceUnit?: 'miles' | 'km';
  cuisineTypes: string[];
  hasSpecialOnly: boolean;
  searchQuery: string;
  priceRange?: string[];
  hasOnlineOrdering?: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultZipCode: "",
  defaultPostalCode: "",
  defaultCountryCode: undefined,  // Auto-detect from device
  defaultRadius: 5,
  defaultRadiusUnit: 'miles',     // Default to miles, will auto-switch based on country
  favorites: [],
};

export const CUISINE_TYPES = [
  "American",
  "Italian",
  "Mexican",
  "Chinese",
  "Japanese",
  "Thai",
  "Indian",
  "Mediterranean",
  "Fast Food",
  "Pizza",
  "Seafood",
  "BBQ",
  "Vegetarian",
  "Cafe",
  "Bakery",
  "Ice Cream",
];

export const PRICE_RANGES = ["$", "$$", "$$$", "$$$$"];

export type DietaryOption = 
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "halal"
  | "kosher"
  | "dairy-free"
  | "nut-free"
  | "keto"
  | "low-carb";

export const DIETARY_OPTIONS: { value: DietaryOption; label: string; emoji: string }[] = [
  { value: "vegetarian", label: "Vegetarian", emoji: "🥬" },
  { value: "vegan", label: "Vegan", emoji: "🌱" },
  { value: "gluten-free", label: "Gluten-Free", emoji: "🌾" },
  { value: "halal", label: "Halal", emoji: "☪️" },
  { value: "kosher", label: "Kosher", emoji: "✡️" },
  { value: "dairy-free", label: "Dairy-Free", emoji: "🥛" },
  { value: "nut-free", label: "Nut-Free", emoji: "🥜" },
  { value: "keto", label: "Keto", emoji: "🥓" },
  { value: "low-carb", label: "Low-Carb", emoji: "🥗" },
];
