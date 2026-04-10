/**
 * Restaurant Sentiment Analysis for Cloudflare Worker
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Lightweight sentiment analysis using phrase matching
 */

export interface SentimentResult {
  score: number;
  sentiment: "positive" | "negative" | "mixed" | "neutral";
  summary: string;
  highlights: string[];
  warnings: string[];
}

// Top 50 most impactful positive phrases (trimmed for worker bundle size)
const POSITIVE_PHRASES = [
  "delicious", "amazing food", "best food", "incredible", "perfectly cooked",
  "fresh ingredients", "authentic", "mouth-watering", "flavorful", "excellent",
  "outstanding", "superb", "generous portions", "great value", "worth it",
  "friendly staff", "excellent service", "attentive", "welcoming", "quick service",
  "great atmosphere", "cozy", "romantic", "beautiful decor", "comfortable",
  "highly recommend", "must try", "hidden gem", "local favorite", "best in town",
  "will be back", "never disappoints", "consistent", "exceeded expectations",
  "5 stars", "perfect", "memorable", "great for groups", "family friendly",
  "clean", "well maintained", "convenient", "easy parking", "kid friendly",
  "accommodating", "professional", "knowledgeable", "helpful", "pleasant",
];

// Top 50 most impactful negative phrases
const NEGATIVE_PHRASES = [
  "terrible", "awful", "disgusting", "inedible", "bland", "tasteless",
  "overcooked", "undercooked", "cold food", "stale", "not fresh",
  "small portions", "overpriced", "rip off", "not worth it", "disappointing",
  "rude staff", "slow service", "long wait", "ignored", "wrong order",
  "forgot order", "terrible service", "unfriendly", "incompetent",
  "dirty", "filthy", "unsanitary", "sticky tables", "smells bad",
  "too loud", "too crowded", "uncomfortable", "sketchy", "bugs",
  "do not recommend", "stay away", "avoid", "never again", "worst",
  "waste of money", "regret", "food poisoning", "got sick", "health code",
  "scam", "false advertising", "bait and switch", "closed down", "1 star",
];

/**
 * Analyze text for restaurant-specific sentiment
 */
export function analyzeRestaurantSentiment(text: string): SentimentResult {
  if (!text || text.length < 10) {
    return {
      score: 0,
      sentiment: "neutral",
      summary: "Not enough information for sentiment analysis.",
      highlights: [],
      warnings: [],
    };
  }

  const lowerText = text.toLowerCase();
  
  let positiveCount = 0;
  let negativeCount = 0;
  const highlights: string[] = [];
  const warnings: string[] = [];
  
  // Count positive phrases
  for (const phrase of POSITIVE_PHRASES) {
    if (lowerText.includes(phrase)) {
      positiveCount++;
      if (highlights.length < 3) {
        highlights.push(phrase);
      }
    }
  }
  
  // Count negative phrases
  for (const phrase of NEGATIVE_PHRASES) {
    if (lowerText.includes(phrase)) {
      negativeCount++;
      if (warnings.length < 3) {
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
  if (total < 2) {
    sentiment = "neutral";
  } else if (score > 0.3) {
    sentiment = "positive";
  } else if (score < -0.3) {
    sentiment = "negative";
  } else {
    sentiment = "mixed";
  }
  
  // Generate summary
  let summary: string;
  if (sentiment === "positive") {
    summary = score > 0.7 
      ? "Highly recommended! People love this place."
      : "Generally well-liked with positive reviews.";
  } else if (sentiment === "negative") {
    summary = score < -0.7
      ? "Caution: Most reviews are negative."
      : "Mixed to negative feedback - proceed with caution.";
  } else if (sentiment === "mixed") {
    summary = "Mixed reviews - experiences vary.";
  } else {
    summary = "Limited review data available.";
  }
  
  return {
    score,
    sentiment,
    summary,
    highlights,
    warnings,
  };
}

/**
 * Generate sentiment from categories and cuisine type when no reviews available
 */
export function inferSentimentFromMetadata(
  categories: string[],
  rating: number,
  reviewCount: number
): SentimentResult {
  // Use rating as primary signal when we have reviews
  if (reviewCount >= 10 && rating > 0) {
    const normalizedScore = (rating - 2.5) / 2.5; // Convert 0-5 to -1 to 1
    
    let sentiment: "positive" | "negative" | "mixed" | "neutral";
    let summary: string;
    
    if (rating >= 4.5) {
      sentiment = "positive";
      summary = `Excellent rating (${rating.toFixed(1)}★) from ${reviewCount.toLocaleString()} reviews.`;
    } else if (rating >= 4.0) {
      sentiment = "positive";
      summary = `Well-rated (${rating.toFixed(1)}★) based on ${reviewCount.toLocaleString()} reviews.`;
    } else if (rating >= 3.5) {
      sentiment = "mixed";
      summary = `Average rating (${rating.toFixed(1)}★) from ${reviewCount.toLocaleString()} reviews.`;
    } else if (rating >= 3.0) {
      sentiment = "mixed";
      summary = `Below average (${rating.toFixed(1)}★) - check recent reviews.`;
    } else {
      sentiment = "negative";
      summary = `Low rating (${rating.toFixed(1)}★) - proceed with caution.`;
    }
    
    return {
      score: normalizedScore,
      sentiment,
      summary,
      highlights: rating >= 4.0 ? ["well-rated", "popular"] : [],
      warnings: rating < 3.5 ? ["lower rating", "mixed reviews"] : [],
    };
  }
  
  // Fallback for limited data
  return {
    score: 0,
    sentiment: "neutral",
    summary: "New or limited reviews - be an early reviewer!",
    highlights: [],
    warnings: [],
  };
}
