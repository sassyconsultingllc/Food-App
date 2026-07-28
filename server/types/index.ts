// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-NGPNBZGDCAPL
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
