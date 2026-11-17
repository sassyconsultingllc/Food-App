// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
import { describe, it, expect } from "vitest";
import { extractReviewAspects } from "../worker/review-aspects";

const labels = (reviews: Parameters<typeof extractReviewAspects>[0]) =>
  extractReviewAspects(reviews).map((a) => a.label);

describe("extractReviewAspects", () => {
  it("finds a quiet place and oceanside coffee", () => {
    const out = labels([
      { text: "Best coffee on the coast, and you sit right on the beach. So peaceful in the morning.", rating: 5 },
      { text: "Quiet spot with an ocean view. The latte was amazing.", rating: 5 },
      { text: "Lovely calm place to read. Great espresso and the beach is right there.", rating: 4 },
    ]);
    expect(out).toContain("Best oceanside coffee");
    expect(out).toContain("Best coffee");
    expect(out.some((l) => /^(Best|Great) place for quiet atmosphere$/.test(l))).toBe(true);
    expect(out.some((l) => /oceanside views$/.test(l))).toBe(true);
  });

  it("calls out a loud place and bad service", () => {
    const out = labels([
      { text: "Way too loud, we couldn't hear each other. Service was rude.", rating: 2 },
      { text: "So noisy. Our server ignored us for 20 minutes and the staff was unfriendly.", rating: 1 },
      { text: "The burgers were good but it was loud.", rating: 3 },
    ]);
    expect(out).toContain("Bad place for quiet atmosphere");
    expect(out).toContain("Bad service");
  });

  it("splits contrasting clauses so each aspect is scored on its own", () => {
    const aspects = extractReviewAspects([
      { text: "The cocktails were fantastic but the service was slow and inattentive.", rating: 3 },
      { text: "Great cocktails; terrible service.", rating: 3 },
    ]);
    const byKey = Object.fromEntries(aspects.map((a) => [a.key, a.verdict]));
    expect(byKey.cocktails).toBe("great");
    expect(byKey.service).toBe("bad");
  });

  it("handles negation and masks aspect terms", () => {
    const aspects = extractReviewAspects([
      { text: "It was not loud at all, nice and relaxing.", rating: 4 },
      { text: "Wasn't noisy, easy to talk.", rating: 4 },
      { text: "Their cold brew is fantastic.", rating: 5 },
      { text: "Cold brew was excellent again.", rating: 5 },
    ]);
    const byKey = Object.fromEntries(aspects.map((a) => [a.key, a.verdict]));
    expect(byKey.quiet).toMatch(/best|great/);
    expect(byKey.coffee).toMatch(/best|great/);
  });

  it("does not read 'great atmosphere' as quiet, or 'hot dogs' as dog-friendly", () => {
    const aspects = extractReviewAspects([
      { text: "Great atmosphere and great hot dogs.", rating: 5 },
      { text: "Amazing atmosphere, loved the hot dogs.", rating: 5 },
    ]);
    const keys = aspects.map((a) => a.key);
    expect(keys).not.toContain("quiet");
    expect(keys).not.toContain("dogs");
  });

  it("returns nothing for empty or contentless reviews", () => {
    expect(extractReviewAspects([])).toEqual([]);
    expect(extractReviewAspects([{ text: "ok", rating: 3 }, { text: "", rating: 5 }])).toEqual([]);
  });
});
