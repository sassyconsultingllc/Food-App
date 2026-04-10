/**
 * Restaurant Sentiment Phrases Dictionary
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * 400+ common phrases used in restaurant reviews for sentiment analysis
 */

export const POSITIVE_PHRASES = [
  // Food Quality (100+ phrases)
  "delicious", "amazing food", "best food", "incredible flavor", "perfectly cooked",
  "fresh ingredients", "authentic taste", "mouth-watering", "flavorful", "tasty",
  "excellent quality", "top notch", "outstanding food", "superb", "divine",
  "heavenly", "scrumptious", "delectable", "exquisite", "perfectly seasoned",
  "cooked to perfection", "melt in your mouth", "best I've ever had", "to die for",
  "finger licking good", "hit the spot", "comfort food", "homemade taste",
  "generous portions", "huge portions", "good value", "worth every penny",
  "bang for your buck", "great deal", "affordable", "reasonably priced",
  "fresh fish", "quality meat", "farm fresh", "locally sourced", "organic",
  "house made", "made from scratch", "secret recipe", "family recipe",
  "crispy", "tender", "juicy", "succulent", "rich flavor", "bold flavors",
  "well balanced", "perfect blend", "great texture", "nice presentation",
  "beautifully plated", "instagram worthy", "picture perfect",
  "best pizza", "best burger", "best tacos", "best sushi", "best steak",
  "best wings", "best ribs", "best pasta", "best curry", "best pho",
  "authentic mexican", "authentic italian", "authentic chinese", "authentic thai",
  "real deal", "legit", "spot on", "nailed it", "exceeded expectations",
  
  // Service (60+ phrases)
  "excellent service", "friendly staff", "attentive", "welcoming", "warm hospitality",
  "great server", "knowledgeable staff", "helpful", "accommodating", "patient",
  "quick service", "fast service", "prompt", "efficient", "no wait",
  "seated immediately", "on time", "punctual", "well organized",
  "went above and beyond", "made us feel welcome", "treated like family",
  "remembered our order", "personalized service", "VIP treatment",
  "professional", "courteous", "polite", "respectful", "pleasant",
  "made recommendations", "great suggestions", "knew the menu well",
  "checked on us", "refilled drinks", "never had to ask",
  "handled special requests", "accommodated allergies", "dietary friendly",
  "kid friendly", "family friendly", "pet friendly", "wheelchair accessible",
  "easy parking", "valet parking", "convenient location",
  "clean restaurant", "spotless", "well maintained", "nice restrooms",
  "great management", "owner was there", "hands on owner",
  
  // Atmosphere (50+ phrases)
  "great atmosphere", "cozy", "romantic", "intimate", "charming",
  "beautiful decor", "nice ambiance", "relaxing", "comfortable", "inviting",
  "trendy", "hip", "modern", "classy", "upscale",
  "casual", "laid back", "chill vibe", "good vibes", "fun atmosphere",
  "lively", "energetic", "great music", "live music", "entertainment",
  "outdoor seating", "patio dining", "rooftop", "waterfront", "scenic view",
  "quiet", "peaceful", "not too loud", "can have conversation",
  "date night spot", "special occasion", "celebration worthy",
  "instagram worthy", "photogenic", "aesthetic",
  "clean", "well lit", "spacious", "not crowded",
  
  // Overall Experience (40+ phrases)
  "highly recommend", "must try", "hidden gem", "local favorite", "best in town",
  "will be back", "coming back", "regular spot", "go-to place", "new favorite",
  "never disappoints", "consistent", "always good", "reliable",
  "exceeded expectations", "pleasantly surprised", "blown away", "impressed",
  "worth the wait", "worth the drive", "worth the price", "worth it",
  "5 stars", "perfect score", "A+", "top rated", "award winning",
  "best experience", "memorable", "unforgettable", "special",
  "great for groups", "perfect for families", "date night approved",
];

export const NEGATIVE_PHRASES = [
  // Food Quality (100+ phrases)
  "terrible food", "awful", "disgusting", "inedible", "gross",
  "bland", "tasteless", "no flavor", "underseasoned", "overseasoned",
  "too salty", "too greasy", "too oily", "too sweet", "too spicy",
  "overcooked", "undercooked", "burnt", "raw", "cold food",
  "stale", "not fresh", "old food", "frozen food", "microwaved",
  "small portions", "tiny portions", "overpriced", "rip off", "not worth it",
  "expensive for what you get", "highway robbery", "tourist trap",
  "soggy", "mushy", "rubbery", "chewy", "tough meat",
  "dry", "flavorless", "boring", "nothing special", "mediocre",
  "disappointing", "let down", "not as good", "went downhill",
  "quality dropped", "not like before", "changed recipe",
  "wrong order", "missing items", "incomplete order",
  "food poisoning", "got sick", "stomach ache", "made me ill",
  "hair in food", "found something", "contaminated", "dirty food",
  "fake", "not authentic", "americanized", "watered down",
  "worst pizza", "worst burger", "worst tacos", "worst sushi",
  "wouldn't feed to dog", "threw it away", "couldn't finish",
  
  // Service (60+ phrases)
  "terrible service", "rude staff", "unfriendly", "unwelcoming", "cold",
  "bad server", "incompetent", "clueless", "unhelpful", "dismissive",
  "slow service", "took forever", "waited too long", "long wait",
  "ignored us", "couldn't get attention", "had to flag down",
  "forgot our order", "wrong order", "messed up order",
  "never came back", "disappeared", "abandoned us",
  "attitude", "eye rolling", "sarcastic", "condescending", "arrogant",
  "argued with us", "defensive", "wouldn't fix problem",
  "no apology", "didn't care", "indifferent", "couldn't care less",
  "understaffed", "overwhelmed", "chaotic", "disorganized",
  "reservation lost", "no record", "overbooked",
  "wouldn't accommodate", "inflexible", "strict policy",
  "manager was worse", "no manager available", "refused to help",
  "charged wrong", "overcharged", "hidden fees", "automatic gratuity",
  
  // Atmosphere (50+ phrases)
  "terrible atmosphere", "depressing", "uncomfortable", "unwelcoming",
  "dirty", "filthy", "disgusting", "unsanitary", "gross",
  "sticky tables", "dirty floors", "nasty restrooms", "needs cleaning",
  "smells bad", "weird smell", "musty", "moldy",
  "too loud", "can't hear", "screaming kids", "noisy",
  "too crowded", "packed", "cramped", "no space",
  "too dark", "too bright", "bad lighting",
  "outdated", "run down", "needs renovation", "falling apart",
  "sketchy", "unsafe", "bad neighborhood", "scary parking lot",
  "bugs", "flies", "roaches", "pests", "rodents",
  "hot inside", "cold inside", "no AC", "freezing",
  "bad music", "too loud music", "annoying",
  
  // Overall Experience (40+ phrases)
  "do not recommend", "stay away", "avoid", "don't waste your money",
  "never again", "never coming back", "one and done", "first and last time",
  "worst experience", "nightmare", "disaster", "horrible",
  "waste of time", "waste of money", "regret", "disappointed",
  "not worth it", "save your money", "go somewhere else",
  "1 star", "zero stars", "negative stars", "F rating",
  "health code violation", "should be shut down", "report them",
  "scam", "fraud", "dishonest", "shady",
  "false advertising", "not as pictured", "bait and switch",
  "went out of business", "closed down", "for good reason",
];

export const NEUTRAL_PHRASES = [
  "okay", "it's fine", "nothing special", "average", "decent",
  "hit or miss", "depends", "sometimes good", "inconsistent",
  "used to be better", "not bad", "could be better", "room for improvement",
  "standard", "typical", "expected", "as expected", "meets expectations",
  "middle of the road", "so-so", "meh", "whatever",
];

import { SentimentResult } from "./types";

/**
 * Analyze text for restaurant-specific sentiment
 */
export function analyzeRestaurantSentiment(text: string): SentimentResult {
  const lowerText = text.toLowerCase();
  
  let positiveCount = 0;
  let negativeCount = 0;
  const highlights: string[] = [];
  const warnings: string[] = [];
  
  // Count positive phrases
  for (const phrase of POSITIVE_PHRASES) {
    if (lowerText.includes(phrase.toLowerCase())) {
      positiveCount++;
      if (highlights.length < 5) {
        highlights.push(phrase);
      }
    }
  }
  
  // Count negative phrases
  for (const phrase of NEGATIVE_PHRASES) {
    if (lowerText.includes(phrase.toLowerCase())) {
      negativeCount++;
      if (warnings.length < 5) {
        warnings.push(phrase);
      }
    }
  }
  
  // Calculate sentiment score (-1 to 1)
  const total = positiveCount + negativeCount;
  let score = 0;
  if (total > 0) {
    score = (positiveCount - negativeCount) / total;
  }
  
  // Determine sentiment category
  let sentiment: "positive" | "negative" | "mixed" | "neutral";
  if (total < 3) {
    sentiment = "neutral";
  } else if (score > 0.3) {
    sentiment = "positive";
  } else if (score < -0.3) {
    sentiment = "negative";
  } else {
    sentiment = "mixed";
  }
  
  // Generate summary
  let summary = "";
  if (sentiment === "positive") {
    if (score > 0.7) {
      summary = "Highly recommended! People love this place.";
    } else {
      summary = "Generally well-liked with positive reviews.";
    }
  } else if (sentiment === "negative") {
    if (score < -0.7) {
      summary = "Caution: Most people don't like this place.";
    } else {
      summary = "Mixed to negative reviews - proceed with caution.";
    }
  } else if (sentiment === "mixed") {
    summary = "Mixed reviews - some love it, some don't.";
  } else {
    summary = "Not enough reviews to determine sentiment.";
  }
  
  return {
    score,
    sentiment,
    positiveCount,
    negativeCount,
    summary,
    highlights,
    warnings,
  };
}

/**
 * Generate a human-readable review summary using sentiment analysis
 */
export function generateReviewSummary(
  reviews: string[],
  restaurantName: string
): string {
  const combinedText = reviews.join(" ");
  const result = analyzeRestaurantSentiment(combinedText);
  
  const parts: string[] = [];
  
  // Opening statement based on sentiment
  if (result.sentiment === "positive") {
    parts.push(`${restaurantName} is a crowd favorite!`);
  } else if (result.sentiment === "negative") {
    parts.push(`${restaurantName} has received concerning feedback.`);
  } else if (result.sentiment === "mixed") {
    parts.push(`${restaurantName} has mixed reviews.`);
  } else {
    parts.push(`${restaurantName} has limited reviews.`);
  }
  
  // Add highlights
  if (result.highlights.length > 0) {
    const topHighlights = result.highlights.slice(0, 3).join(", ");
    parts.push(`Praised for: ${topHighlights}.`);
  }
  
  // Add warnings
  if (result.warnings.length > 0) {
    const topWarnings = result.warnings.slice(0, 3).join(", ");
    parts.push(`Some complaints about: ${topWarnings}.`);
  }
  
  return parts.join(" ");
}
