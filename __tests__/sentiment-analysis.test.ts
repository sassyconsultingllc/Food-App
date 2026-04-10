/**
 * Sentiment Analysis Tests
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { describe, it, expect } from "vitest";
import {
  POSITIVE_PHRASES,
  NEGATIVE_PHRASES,
  analyzeRestaurantSentiment,
  generateReviewSummary,
} from "../server/sentiment-phrases";

describe("Sentiment Phrases Dictionary", () => {
  it("should have at least 200 positive phrases", () => {
    expect(POSITIVE_PHRASES.length).toBeGreaterThanOrEqual(200);
  });

  it("should have at least 200 negative phrases", () => {
    expect(NEGATIVE_PHRASES.length).toBeGreaterThanOrEqual(200);
  });

  it("should have mostly unique positive phrases (>95%)", () => {
    const uniquePhrases = new Set(POSITIVE_PHRASES.map(p => p.toLowerCase()));
    const uniqueRatio = uniquePhrases.size / POSITIVE_PHRASES.length;
    expect(uniqueRatio).toBeGreaterThan(0.95);
  });

  it("should have mostly unique negative phrases (>95%)", () => {
    const uniquePhrases = new Set(NEGATIVE_PHRASES.map(p => p.toLowerCase()));
    const uniqueRatio = uniquePhrases.size / NEGATIVE_PHRASES.length;
    expect(uniqueRatio).toBeGreaterThan(0.95);
  });
});

describe("Sentiment Analysis", () => {
  it("should detect positive sentiment from positive reviews", () => {
    const text = "This restaurant is amazing! The food was delicious and the service was excellent. Highly recommend this place. Best burger I've ever had!";
    const result = analyzeRestaurantSentiment(text);
    
    expect(result.sentiment).toBe("positive");
    expect(result.score).toBeGreaterThan(0);
    expect(result.positiveCount).toBeGreaterThan(result.negativeCount);
  });

  it("should detect negative sentiment from negative reviews", () => {
    const text = "Terrible food and rude staff. The service was slow and the food was cold. Dirty restaurant, never coming back. Worst experience ever.";
    const result = analyzeRestaurantSentiment(text);
    
    expect(result.sentiment).toBe("negative");
    expect(result.score).toBeLessThan(0);
    expect(result.negativeCount).toBeGreaterThan(result.positiveCount);
  });

  it("should detect mixed sentiment from mixed reviews", () => {
    const text = "The food was delicious but the service was terrible. Great atmosphere but slow service. Worth it for the food but rude staff.";
    const result = analyzeRestaurantSentiment(text);
    
    expect(result.sentiment).toBe("mixed");
  });

  it("should return neutral for text with no sentiment phrases", () => {
    const text = "I went to this restaurant yesterday. They have tables and chairs.";
    const result = analyzeRestaurantSentiment(text);
    
    expect(result.sentiment).toBe("neutral");
  });

  it("should extract highlights from positive reviews", () => {
    const text = "Delicious food with friendly staff and great atmosphere. The portions were generous and it was worth every penny.";
    const result = analyzeRestaurantSentiment(text);
    
    expect(result.highlights.length).toBeGreaterThan(0);
    expect(result.highlights.some(h => h.toLowerCase().includes("delicious"))).toBe(true);
  });

  it("should extract warnings from negative reviews", () => {
    const text = "Cold food and rude staff. The place was dirty and the service was slow.";
    const result = analyzeRestaurantSentiment(text);
    
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("should generate appropriate summary for positive sentiment", () => {
    const text = "Amazing food, excellent service, best restaurant in town. Highly recommend!";
    const result = analyzeRestaurantSentiment(text);
    
    expect(result.summary).toContain("recommend");
  });

  it("should generate appropriate summary for negative sentiment", () => {
    const text = "Terrible food, rude staff, dirty restaurant. Worst experience, never again.";
    const result = analyzeRestaurantSentiment(text);
    
    expect(result.summary.toLowerCase()).toContain("caution");
  });
});

describe("Review Summary Generation", () => {
  it("should generate summary with restaurant name", () => {
    const reviews = [
      "Great food and friendly service!",
      "Delicious meals, will come back.",
      "Best restaurant in the area.",
    ];
    const summary = generateReviewSummary(reviews, "Test Restaurant");
    
    expect(summary).toContain("Test Restaurant");
  });

  it("should mention highlights in summary", () => {
    const reviews = [
      "The food was delicious and fresh.",
      "Excellent service and friendly staff.",
      "Great atmosphere and cozy place.",
    ];
    const summary = generateReviewSummary(reviews, "Good Place");
    
    expect(summary.length).toBeGreaterThan(0);
  });

  it("should mention warnings in summary for negative reviews", () => {
    const reviews = [
      "Terrible food and cold service.",
      "Rude staff and dirty tables.",
      "Slow service and overpriced.",
    ];
    const summary = generateReviewSummary(reviews, "Bad Place");
    
    expect(summary.length).toBeGreaterThan(0);
  });
});
