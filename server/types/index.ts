/**
 * Shared Types
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

export interface SentimentResult {
  score: number; // -1 to 1 scale
  sentiment: "positive" | "negative" | "mixed" | "neutral";
  positiveCount: number;
  negativeCount: number;
  summary: string;
  highlights: string[];
  warnings: string[];
}
