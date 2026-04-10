/**
 * Backend integration test — 53578 (Sauk City/Prairie du Sac WI) → 90210 (Beverly Hills)
 *
 * Validates:
 *  1. scrapeRestaurantsByLocation fetches every restaurant in the target ZIP
 *  2. Photo enrichment runs (Place Details cap = 20)
 *  3. Each restaurant has the fields the UI expects (yelpUrl, googleMapsUrl,
 *     delivery URLs, ratings.aggregated, ratings.google/foursquare/here, etc.)
 *  4. buildTasteProfile from "favorited" top 5 in 53578 produces a valid profile
 *  5. getCrossLocaleMatches surfaces 90210 restaurants matching that profile
 *
 * Run with:  pnpm tsx scripts/test-cross-locale-matching.ts
 */

import "dotenv/config";
import { scrapeRestaurantsByLocation } from "../server/restaurant-scraper";
import {
  buildTasteProfile,
  getCrossLocaleMatches,
  getLocalTasteMatches,
  scoreRestaurant,
} from "../hooks/use-taste-profile";
import type { Restaurant } from "../types/restaurant";
import type { ScrapedRestaurant } from "../server/restaurant-scraper";

const HOME_ZIP = "53578"; // Prairie du Sac / Sauk City, WI
const TRAVEL_ZIP = "90210"; // Beverly Hills, CA
const RADIUS_MILES = 10;

// --------------------------------------------------------------------------
// Formatting helpers
// --------------------------------------------------------------------------

const RULE = "═".repeat(80);
const THIN = "─".repeat(80);

function section(title: string) {
  console.log();
  console.log(RULE);
  console.log(`  ${title}`);
  console.log(RULE);
}

function sub(title: string) {
  console.log();
  console.log(THIN);
  console.log(`  ${title}`);
  console.log(THIN);
}

function yesno(b: unknown): string {
  return b ? "✓" : "✗";
}

function fmtRating(r: number | undefined): string {
  return r != null ? r.toFixed(1).padStart(4) : " —  ";
}

// --------------------------------------------------------------------------
// Adapter: ScrapedRestaurant → Restaurant (mirrors hooks/use-restaurant-storage.ts)
// --------------------------------------------------------------------------

function toRestaurant(s: ScrapedRestaurant): Restaurant {
  return {
    id: s.id,
    name: s.name,
    cuisineType: s.cuisineType,
    address: s.address,
    city: s.city,
    state: s.state,
    zipCode: s.zipCode || s.postalCode || "",
    postalCode: s.postalCode,
    country: s.country,
    countryCode: s.countryCode,
    latitude: s.latitude,
    longitude: s.longitude,
    phone: s.phone,
    website: s.website,
    yelpUrl: (s as any).yelpUrl,
    googleMapsUrl: (s as any).googleMapsUrl,
    doordashUrl: s.doordashUrl,
    ubereatsUrl: s.ubereatsUrl,
    grubhubUrl: s.grubhubUrl,
    isCulvers: s.isCulvers || false,
    flavorOfTheDay: s.flavorOfTheDay,
    flavorDescription: s.flavorDescription,
    ratings: s.ratings,
    menu: s.menuUrl ? { url: s.menuUrl } : undefined,
    priceRange: s.priceRange as any,
    hours: s.hours as any,
    photos: s.photos,
    categories: s.categories,
    sentiment: s.sentiment,
    description: s.reviewSummary,
    dataSources: s.sources,
  };
}

// --------------------------------------------------------------------------
// Restaurant field audit — what the UI reads, what the pipeline produces
// --------------------------------------------------------------------------

function auditRestaurantFields(r: Restaurant): Record<string, boolean> {
  return {
    name: !!r.name,
    address: !!r.address,
    city: !!r.city,
    cuisineType: !!r.cuisineType,
    lat_lng: !!(r.latitude && r.longitude),
    rating: (r.ratings?.aggregated || 0) > 0,
    reviewCount: (r.ratings?.totalReviews || 0) > 0,
    anySourceRating: !!(
      r.ratings?.google != null ||
      r.ratings?.foursquare != null ||
      r.ratings?.here != null
    ),
    photos: !!(r.photos && r.photos.length > 0),
    multiplePhotos: !!(r.photos && r.photos.length > 1),
    phone: !!r.phone,
    website: !!r.website,
    yelpUrl: !!r.yelpUrl,
    googleMapsUrl: !!r.googleMapsUrl,
    doordashUrl: !!r.doordashUrl,
    ubereatsUrl: !!r.ubereatsUrl,
    grubhubUrl: !!r.grubhubUrl,
    priceRange: !!r.priceRange,
    sentiment: !!r.sentiment,
  };
}

function printFieldCoverage(restaurants: Restaurant[], label: string) {
  sub(`Field coverage — ${label}`);
  if (restaurants.length === 0) {
    console.log("  (no restaurants)");
    return;
  }
  const keys = Object.keys(auditRestaurantFields(restaurants[0]));
  const totals: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));

  for (const r of restaurants) {
    const audit = auditRestaurantFields(r);
    for (const k of keys) {
      if (audit[k]) totals[k]++;
    }
  }

  const n = restaurants.length;
  console.log(`  ${n} restaurants total`);
  console.log();
  for (const k of keys) {
    const v = totals[k];
    const pct = Math.round((v / n) * 100);
    const bar = "█".repeat(Math.round(pct / 5)).padEnd(20);
    console.log(`    ${k.padEnd(20)} ${v.toString().padStart(3)}/${n}  ${bar} ${pct}%`);
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  section(`Cross-locale taste matching test`);
  console.log(`  Home ZIP:   ${HOME_ZIP} (radius ${RADIUS_MILES}mi)`);
  console.log(`  Travel ZIP: ${TRAVEL_ZIP} (radius ${RADIUS_MILES}mi)`);
  console.log(`  GOOGLE_PLACES_API_KEY: ${process.env.GOOGLE_PLACES_API_KEY ? "✓ set" : "✗ missing"}`);

  // ------------------------------------------------------------------------
  // Stage 1: Scrape 53578
  // ------------------------------------------------------------------------
  section(`STAGE 1 — Scrape ${HOME_ZIP}`);
  const homeStart = Date.now();
  const homeScraped = await scrapeRestaurantsByLocation({
    postalCode: HOME_ZIP,
    countryCode: "US",
    radius: RADIUS_MILES,
    radiusUnit: "miles",
    limit: 50,
  });
  const homeMs = Date.now() - homeStart;
  const homeRestaurants = homeScraped.map(toRestaurant);
  console.log(`\n  Scraped ${homeRestaurants.length} restaurants in ${homeMs}ms`);

  if (homeRestaurants.length === 0) {
    console.error("\n  ✗ No restaurants found. Cannot proceed with taste profile.");
    process.exit(1);
  }

  sub(`Restaurants in ${HOME_ZIP}`);
  console.log(
    `    ${"#".padStart(3)}  ${"NAME".padEnd(30)} ${"CUISINE".padEnd(18)} RATING  PRICE  PHOTOS  SOURCES`
  );
  homeRestaurants.slice(0, 25).forEach((r, i) => {
    const name = (r.name || "?").slice(0, 30).padEnd(30);
    const cuisine = (r.cuisineType || "?").slice(0, 18).padEnd(18);
    const rating = fmtRating(r.ratings?.aggregated);
    const price = (r.priceRange || "-").padEnd(5);
    const photos = String(r.photos?.length || 0).padStart(6);
    const sources = (r.dataSources || []).join(",");
    console.log(
      `    ${String(i + 1).padStart(3)}. ${name} ${cuisine} ${rating}  ${price}  ${photos}  ${sources}`
    );
  });
  if (homeRestaurants.length > 25) {
    console.log(`    ... and ${homeRestaurants.length - 25} more`);
  }

  printFieldCoverage(homeRestaurants, HOME_ZIP);

  // ------------------------------------------------------------------------
  // Stage 2: Simulate favoriting the top 5 highest-rated restaurants
  // ------------------------------------------------------------------------
  section(`STAGE 2 — Simulate "favorite top 5 highest-rated" in ${HOME_ZIP}`);

  const favorites = [...homeRestaurants]
    .filter((r) => (r.ratings?.aggregated || 0) > 0)
    .sort((a, b) => (b.ratings.aggregated || 0) - (a.ratings.aggregated || 0))
    .slice(0, 5);

  console.log(`\n  Favorited ${favorites.length} restaurants:`);
  favorites.forEach((f, i) => {
    console.log(
      `    ${i + 1}. ${f.name.padEnd(32)} ${f.cuisineType.padEnd(16)} ★${(f.ratings.aggregated || 0).toFixed(1)}  ${f.priceRange || "-"}`
    );
  });

  // Also simulate "personal note — I liked the X off the menu"
  sub(`Personal notes simulation (what the TextInput would store)`);
  const personalNotes: Record<string, string> = {};
  favorites.forEach((f, i) => {
    // Generate a plausible "dish" based on cuisine for the note
    const cuisine = f.cuisineType.toLowerCase();
    const dish =
      cuisine.includes("pizza") ? "margherita pizza"
      : cuisine.includes("mexican") ? "al pastor tacos"
      : cuisine.includes("burger") || cuisine.includes("american") ? "bacon cheeseburger"
      : cuisine.includes("italian") ? "chicken parmesan"
      : cuisine.includes("asian") || cuisine.includes("chinese") ? "sesame chicken"
      : cuisine.includes("mexican") ? "carne asada"
      : cuisine.includes("steak") ? "ribeye"
      : cuisine.includes("seafood") ? "fish & chips"
      : cuisine.includes("cafe") || cuisine.includes("bakery") ? "almond croissant"
      : cuisine.includes("ice") ? "turtle sundae"
      : "the house special";
    const note = `Had the ${dish} — it was excellent. Highly recommend.`;
    personalNotes[f.id] = note;
    console.log(`    [${f.id}]`);
    console.log(`      ${f.name}: "${note}"`);
  });

  // ------------------------------------------------------------------------
  // Stage 3: Build taste profile
  // ------------------------------------------------------------------------
  section(`STAGE 3 — Build taste profile from favorites`);
  const profile = buildTasteProfile(favorites, {
    homeCity: favorites[0]?.city,
    homePostalCode: HOME_ZIP,
  });

  console.log(`\n  Sample size:  ${profile.sampleSize}`);
  console.log(`  Home city:    ${profile.homeCity || "(none)"}`);
  console.log(`  Home ZIP:     ${profile.homePostalCode || "(none)"}`);
  console.log(`  Avg rating:   ${profile.avgRating.toFixed(2)}`);
  console.log(`  Dietary:      ${[...profile.dietaryPrefs].join(", ") || "(none)"}`);

  sub(`Cuisine weights`);
  const cuisineEntries = Object.entries(profile.cuisineWeights).sort((a, b) => b[1] - a[1]);
  cuisineEntries.forEach(([k, v]) => {
    const bar = "█".repeat(Math.round(v * 40)).padEnd(40);
    console.log(`    ${k.padEnd(20)} ${bar} ${(v * 100).toFixed(0)}%`);
  });

  sub(`Price weights`);
  const priceEntries = Object.entries(profile.priceWeights).sort((a, b) => b[1] - a[1]);
  if (priceEntries.length === 0) {
    console.log("    (no price data)");
  } else {
    priceEntries.forEach(([k, v]) => {
      const bar = "█".repeat(Math.round(v * 40)).padEnd(40);
      console.log(`    ${k.padEnd(20)} ${bar} ${(v * 100).toFixed(0)}%`);
    });
  }

  // ------------------------------------------------------------------------
  // Stage 4: Scrape 90210
  // ------------------------------------------------------------------------
  section(`STAGE 4 — Scrape ${TRAVEL_ZIP}`);
  const travelStart = Date.now();
  const travelScraped = await scrapeRestaurantsByLocation({
    postalCode: TRAVEL_ZIP,
    countryCode: "US",
    radius: RADIUS_MILES,
    radiusUnit: "miles",
    limit: 50,
  });
  const travelMs = Date.now() - travelStart;
  const travelRestaurants = travelScraped.map(toRestaurant);
  console.log(`\n  Scraped ${travelRestaurants.length} restaurants in ${travelMs}ms`);

  sub(`Top 10 restaurants in ${TRAVEL_ZIP} by rating`);
  const top10 = [...travelRestaurants]
    .sort((a, b) => (b.ratings.aggregated || 0) - (a.ratings.aggregated || 0))
    .slice(0, 10);
  top10.forEach((r, i) => {
    const name = (r.name || "?").slice(0, 30).padEnd(30);
    const cuisine = (r.cuisineType || "?").slice(0, 18).padEnd(18);
    const rating = fmtRating(r.ratings?.aggregated);
    const price = (r.priceRange || "-").padEnd(5);
    console.log(`    ${String(i + 1).padStart(3)}. ${name} ${cuisine} ${rating}  ${price}`);
  });

  printFieldCoverage(travelRestaurants, TRAVEL_ZIP);

  // ------------------------------------------------------------------------
  // Stage 5: Cross-locale matching
  // ------------------------------------------------------------------------
  section(`STAGE 5 — Cross-locale matches (home=${HOME_ZIP} → travel=${TRAVEL_ZIP})`);

  // Combined pool like the app would have after two searches
  const combinedPool = [...homeRestaurants, ...travelRestaurants];
  const favoriteIds = new Set(favorites.map((f) => f.id));

  const localMatches = getLocalTasteMatches(profile, combinedPool, favoriteIds, { topK: 10 });
  const crossMatches = getCrossLocaleMatches(profile, combinedPool, favoriteIds, { topK: 10 });

  sub(`"In Your Area" (local matches in ${HOME_ZIP})`);
  if (localMatches.length === 0) {
    console.log("    (none — user has already favorited the local matches)");
  } else {
    localMatches.forEach((m, i) => {
      const name = m.restaurant.name.slice(0, 28).padEnd(28);
      const cuisine = m.restaurant.cuisineType.slice(0, 16).padEnd(16);
      const city = (m.restaurant.city || "?").slice(0, 14).padEnd(14);
      const score = (m.score * 100).toFixed(0).padStart(3);
      console.log(`    ${String(i + 1).padStart(3)}. ${name} ${cuisine} ${city} ${score}%  "${m.reason}"`);
    });
  }

  sub(`"When You Travel" (cross-locale matches in ${TRAVEL_ZIP})`);
  if (crossMatches.length === 0) {
    console.log("    (no cross-locale matches above threshold)");
  } else {
    crossMatches.forEach((m, i) => {
      const name = m.restaurant.name.slice(0, 28).padEnd(28);
      const cuisine = m.restaurant.cuisineType.slice(0, 16).padEnd(16);
      const city = (m.restaurant.city || "?").slice(0, 14).padEnd(14);
      const score = (m.score * 100).toFixed(0).padStart(3);
      console.log(`    ${String(i + 1).padStart(3)}. ${name} ${cuisine} ${city} ${score}%  "${m.reason}"`);
    });
  }

  // ------------------------------------------------------------------------
  // Stage 6: Final report
  // ------------------------------------------------------------------------
  section(`FINAL REPORT`);

  const homePhotosWithMultiple = homeRestaurants.filter((r) => (r.photos?.length || 0) > 1).length;
  const travelPhotosWithMultiple = travelRestaurants.filter((r) => (r.photos?.length || 0) > 1).length;

  console.log();
  console.log(`  ${HOME_ZIP}: ${homeRestaurants.length} restaurants scraped in ${homeMs}ms`);
  console.log(`    - ${homePhotosWithMultiple} have multiple photos (photo enrichment active)`);
  console.log(
    `    - ${homeRestaurants.filter((r) => r.yelpUrl).length}/${homeRestaurants.length} have yelpUrl`
  );
  console.log(
    `    - ${homeRestaurants.filter((r) => r.googleMapsUrl).length}/${homeRestaurants.length} have googleMapsUrl`
  );
  console.log(
    `    - ${homeRestaurants.filter((r) => r.doordashUrl).length}/${homeRestaurants.length} have delivery URLs`
  );

  console.log();
  console.log(`  ${TRAVEL_ZIP}: ${travelRestaurants.length} restaurants scraped in ${travelMs}ms`);
  console.log(`    - ${travelPhotosWithMultiple} have multiple photos`);

  console.log();
  console.log(`  Taste profile:`);
  console.log(`    - ${profile.sampleSize} favorites → ${cuisineEntries.length} unique cuisines`);
  console.log(`    - Top cuisine: ${cuisineEntries[0]?.[0] || "(none)"} (${((cuisineEntries[0]?.[1] || 0) * 100).toFixed(0)}%)`);
  console.log(`    - Avg favorite rating: ${profile.avgRating.toFixed(2)}`);

  console.log();
  console.log(`  Cross-locale matching:`);
  console.log(`    - Local matches (${HOME_ZIP}):   ${localMatches.length}`);
  console.log(`    - Cross-locale (${TRAVEL_ZIP}):  ${crossMatches.length}`);
  if (crossMatches.length > 0) {
    console.log(`    - Top cross match: ${crossMatches[0].restaurant.name} (${(crossMatches[0].score * 100).toFixed(0)}%)`);
  }

  console.log();
  console.log(`  Overall checks:`);
  console.log(`    ${yesno(homeRestaurants.length > 0)} Found restaurants in home ZIP`);
  console.log(`    ${yesno(travelRestaurants.length > 0)} Found restaurants in travel ZIP`);
  console.log(`    ${yesno(profile.sampleSize >= 2)} Taste profile has >= 2 samples`);
  console.log(`    ${yesno(Object.keys(profile.cuisineWeights).length > 0)} Cuisine weights populated`);
  console.log(`    ${yesno(profile.avgRating > 0)} Avg rating computed`);
  console.log(
    `    ${yesno(homeRestaurants.some((r) => r.ratings?.google != null || r.ratings?.foursquare != null || r.ratings?.here != null))} Home restaurants carry source-level ratings`
  );
  console.log(
    `    ${yesno(homeRestaurants.some((r) => r.yelpUrl && r.googleMapsUrl))} External URLs populated`
  );
  console.log(
    `    ${yesno(crossMatches.length > 0)} Cross-locale matching surfaced travel suggestions`
  );

  console.log();
  console.log(RULE);
  console.log();
}

main().catch((e) => {
  console.error("\n✗ Test failed:");
  console.error(e);
  process.exit(1);
});
