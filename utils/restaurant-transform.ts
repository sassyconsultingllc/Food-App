// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-SGLBU7KU345C
/**
 * Restaurant Transform
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Converts a raw server/D1 restaurant record into the client `Restaurant`
 * shape. Previously this lived inside use-restaurant-storage, which meant the
 * only code path that could produce a well-formed Restaurant was the ZIP
 * search. Anything that resolves a restaurant by id from another source
 * (the getById server fallback, "More Like This" results, etc.) needs the
 * exact same normalization — most importantly resolving relative photo proxy
 * URLs (`/api/photo?ref=...`) to absolute URLs, since relative paths silently
 * fail to load in React Native.
 */

import { getApiBaseUrl } from "@/constants/oauth";
import { Restaurant, DietaryOption } from "@/types/restaurant";

// Map raw Google Places types to readable labels
const CUISINE_TYPE_MAP: Record<string, string> = {
  // Generic fallbacks
  restaurant: "Restaurant",
  food: "Restaurant",
  point_of_interest: "Restaurant",
  establishment: "Restaurant",
  // Service types
  meal_takeaway: "Carryout",
  meal_delivery: "Delivery",
  // Specific cuisines
  american_restaurant: "American",
  barbecue_restaurant: "BBQ",
  bbq_restaurant: "BBQ",
  brazilian_restaurant: "Brazilian",
  breakfast_restaurant: "Breakfast",
  brunch_restaurant: "Brunch",
  burger_restaurant: "Burgers",
  hamburger_restaurant: "Burgers",
  cafe: "Cafe",
  coffee_shop: "Coffee",
  chicken_restaurant: "Chicken",
  chinese_restaurant: "Chinese",
  diner: "Diner",
  fast_food_restaurant: "Fast Food",
  french_restaurant: "French",
  greek_restaurant: "Greek",
  indian_restaurant: "Indian",
  indonesian_restaurant: "Indonesian",
  italian_restaurant: "Italian",
  japanese_restaurant: "Japanese",
  korean_restaurant: "Korean",
  lebanese_restaurant: "Lebanese",
  mediterranean_restaurant: "Mediterranean",
  mexican_restaurant: "Mexican",
  middle_eastern_restaurant: "Middle Eastern",
  noodle_restaurant: "Noodles",
  pizza_restaurant: "Pizza",
  ramen_restaurant: "Ramen",
  sandwich_shop: "Sandwiches",
  seafood_restaurant: "Seafood",
  steak_house: "Steakhouse",
  sushi_restaurant: "Sushi",
  thai_restaurant: "Thai",
  turkish_restaurant: "Turkish",
  vegan_restaurant: "Vegan",
  vegetarian_restaurant: "Vegetarian",
  vietnamese_restaurant: "Vietnamese",
  bakery: "Bakery",
  bar: "Bar",
  bar_and_grill: "Bar & Grill",
  buffet_restaurant: "Buffet",
  food_court: "Food Court",
  ice_cream_shop: "Ice Cream",
  pub: "Pub",
};

/** Convert any unmapped snake_case Google type to Title Case */
export function normalizeGoogleType(raw: string): string {
  if (CUISINE_TYPE_MAP[raw]) return CUISINE_TYPE_MAP[raw];
  return raw
    .replace(/_restaurant$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Infer dietary options from categories, cuisine type, and restaurant name.
// Uses explicit keywords plus cuisine-type heuristics for broader coverage.
export function inferDietaryOptions(
  categories: string[],
  cuisineType: string,
  restaurantName?: string
): DietaryOption[] {
  const searchText = [...categories, cuisineType].join(" ").toLowerCase();
  const nameText = (restaurantName || "").toLowerCase();

  const dietaryKeywords: Record<DietaryOption, string[]> = {
    vegetarian: [
      "vegetarian", "veggie", "meatless", "plant-based", "plant based",
      "meat-free", "meat free", "vegetarian-friendly",
    ],
    vegan: ["vegan", "plant-based", "plant based", "raw vegan", "plant kitchen"],
    "gluten-free": [
      "gluten-free", "gluten free", "celiac", "gluten friendly",
      "wheat-free", "wheat free",
    ],
    halal: ["halal", "halal certified", "zabiha"],
    kosher: ["kosher", "kosher certified", "pareve"],
    "dairy-free": [
      "dairy-free", "dairy free", "lactose-free", "lactose free",
      "milk-free", "milk free",
    ],
    "nut-free": ["nut-free", "nut free", "peanut-free", "peanut free"],
    keto: ["keto", "ketogenic", "keto friendly"],
    "low-carb": ["low-carb", "low carb", "carb-conscious"],
  };

  const dietary: DietaryOption[] = [];
  for (const [option, keywords] of Object.entries(dietaryKeywords)) {
    if (keywords.some((kw) => searchText.includes(kw) || nameText.includes(kw))) {
      dietary.push(option as DietaryOption);
    }
  }

  // Cuisine-type heuristics: many cuisines commonly offer these options
  const cuisineLower = cuisineType.toLowerCase();
  const cuisineDietaryMap: Record<string, DietaryOption[]> = {
    indian: ["vegetarian"],
    thai: ["vegetarian", "gluten-free"],
    japanese: ["gluten-free"],
    mexican: ["vegetarian", "gluten-free"],
    mediterranean: ["vegetarian", "gluten-free"],
    "middle eastern": ["halal", "vegetarian"],
    turkish: ["halal"],
    lebanese: ["halal", "vegetarian"],
    vietnamese: ["gluten-free"],
    salad: ["vegetarian", "vegan", "gluten-free"],
    juice: ["vegan", "gluten-free"],
    smoothie: ["vegan", "gluten-free"],
    "health food": ["vegetarian", "vegan", "gluten-free"],
  };

  for (const [cuisine, options] of Object.entries(cuisineDietaryMap)) {
    if (cuisineLower.includes(cuisine)) {
      options.forEach((opt) => dietary.push(opt));
    }
  }

  return [...new Set(dietary)];
}

/**
 * Transform a raw server restaurant record (from the ZIP search, the getById
 * fallback, or a "similar" result) into the client `Restaurant` shape.
 */
export function transformServerRestaurant(serverRestaurant: any): Restaurant {
  const categories = serverRestaurant.categories || [];
  const rawCuisine = serverRestaurant.cuisineType || "Restaurant";
  const cuisineType = normalizeGoogleType(rawCuisine);
  const restaurantName = serverRestaurant.name || "";

  const dietaryOptions = inferDietaryOptions(categories, cuisineType, restaurantName);

  return {
    id: serverRestaurant.id,
    name: restaurantName,
    cuisineType,
    address: serverRestaurant.address || "",
    city: serverRestaurant.city || "",
    state: serverRestaurant.state || "",
    // postalCode is the canonical international field; zipCode kept as
    // legacy alias. Pull from whichever the server populated — previously
    // only zipCode was copied, which dropped all non-US postal data.
    postalCode: serverRestaurant.postalCode || serverRestaurant.zipCode || "",
    zipCode: serverRestaurant.zipCode || serverRestaurant.postalCode || "",
    country: serverRestaurant.country,
    countryCode: serverRestaurant.countryCode,
    latitude: serverRestaurant.latitude || 0,
    longitude: serverRestaurant.longitude || 0,
    phone: serverRestaurant.phone,
    website: serverRestaurant.website,
    facebookUrl: serverRestaurant.facebookUrl,
    yelpUrl: serverRestaurant.yelpUrl,
    googleMapsUrl: serverRestaurant.googleMapsUrl,
    doordashUrl: serverRestaurant.doordashUrl,
    ubereatsUrl: serverRestaurant.ubereatsUrl,
    grubhubUrl: serverRestaurant.grubhubUrl,
    isCulvers: serverRestaurant.isCulvers || false,
    flavorOfTheDay: serverRestaurant.flavorOfTheDay,
    flavorDescription: serverRestaurant.flavorDescription,
    ratings: {
      aggregated: serverRestaurant.ratings?.aggregated || 0,
      totalReviews: serverRestaurant.ratings?.totalReviews || 0,
      google: serverRestaurant.ratings?.google,
      googleReviewCount: serverRestaurant.ratings?.googleReviewCount,
      foursquare: serverRestaurant.ratings?.foursquare,
      foursquareReviewCount: serverRestaurant.ratings?.foursquareReviewCount,
      here: serverRestaurant.ratings?.here,
      hereReviewCount: serverRestaurant.ratings?.hereReviewCount,
    },
    priceRange: serverRestaurant.priceRange,
    hours: serverRestaurant.hours,
    categories,
    dietaryOptions,
    description: serverRestaurant.reviewSummary,
    // Resolve relative photo proxy URLs (/api/photo?ref=...) to full
    // URLs so expo-image can fetch them on native. Relative paths work
    // in browsers but silently fail in React Native.
    photos: Array.from(
      new Set<string>(
        (serverRestaurant.photos || []).map((p: string) => {
          if (p.startsWith("/")) return `${getApiBaseUrl()}${p}`;
          return p;
        })
      )
    ),
    menu:
      serverRestaurant.menu ||
      (serverRestaurant.menuUrl ? { url: serverRestaurant.menuUrl } : undefined),
    sentiment: serverRestaurant.sentiment,
    reviewSummary: serverRestaurant.reviewSummary,
    dailySpecial: serverRestaurant.dailySpecial,
    lastUpdated: serverRestaurant.scrapedAt,
    dataSources: serverRestaurant.sources || [],
  };
}
