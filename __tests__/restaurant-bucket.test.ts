import { describe, it, expect } from "vitest";
import {
  geohashEncode,
  normalizeRestaurantName,
  canonicalIdentity,
  computeBucketId,
  BUCKET_SCHEME_VERSION,
} from "../worker/restaurant-bucket";

const PEPPER = "test-pepper-not-for-production";

// Two coordinates ~3 m apart in Madison, WI — used to prove that GPS / provider
// jitter for the SAME venue collapses to one bucket.
const MAD_A = { lat: 43.0731, lng: -89.4012 };
const MAD_B = { lat: 43.07311, lng: -89.40121 };
// A clearly different city (NYC) — different bucket.
const NYC = { lat: 40.7128, lng: -74.006 };

describe("geohashEncode", () => {
  it("matches the canonical geohash test vector", () => {
    // Wikipedia reference: (57.64911, 10.40744) -> "u4pruydqqvj"
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
    expect(geohashEncode(57.64911, 10.40744, 7)).toBe("u4pruyd");
  });

  it("collapses sub-cell jitter into the same ~150 m cell", () => {
    expect(geohashEncode(MAD_A.lat, MAD_A.lng)).toBe(geohashEncode(MAD_B.lat, MAD_B.lng));
  });

  it("separates distant locations", () => {
    expect(geohashEncode(MAD_A.lat, MAD_A.lng)).not.toBe(geohashEncode(NYC.lat, NYC.lng));
  });

  it("rejects out-of-range / non-finite coordinates", () => {
    expect(() => geohashEncode(91, 0)).toThrow();
    expect(() => geohashEncode(0, 200)).toThrow();
    expect(() => geohashEncode(Number.NaN, 0)).toThrow();
    expect(() => geohashEncode(0, Infinity)).toThrow();
  });
});

describe("normalizeRestaurantName", () => {
  it("converges case, accents, punctuation, spacing and &/and", () => {
    expect(normalizeRestaurantName("Café Déjà Vu!")).toBe("cafedejavu");
    expect(normalizeRestaurantName("  McDonald's  ")).toBe("mcdonalds");
    expect(normalizeRestaurantName("Joe's & Co.")).toBe("joesandco");
    expect(normalizeRestaurantName("JOE'S AND CO")).toBe("joesandco");
  });

  it("preserves non-latin scripts (worldwide support)", () => {
    expect(normalizeRestaurantName("寿司")).toBe("寿司");
  });

  it("returns empty for a name with no letters/digits", () => {
    expect(normalizeRestaurantName("!!! ???")).toBe("");
  });
});

describe("canonicalIdentity", () => {
  it("is version-prefixed", () => {
    expect(canonicalIdentity("Joe's Pizza", MAD_A.lat, MAD_A.lng).startsWith(`${BUCKET_SCHEME_VERSION}|`)).toBe(true);
  });

  it("refuses to bucket a degenerate (empty) name", () => {
    expect(() => canonicalIdentity("!!!", MAD_A.lat, MAD_A.lng)).toThrow();
  });
});

describe("computeBucketId", () => {
  it("is deterministic and version-prefixed", async () => {
    const a = await computeBucketId(PEPPER, "Joe's Pizza", MAD_A.lat, MAD_A.lng);
    const b = await computeBucketId(PEPPER, "Joe's Pizza", MAD_A.lat, MAD_A.lng);
    expect(a).toBe(b);
    expect(a).toMatch(/^v1_[a-z2-7]{26}$/);
  });

  it("same venue with cross-provider name variance -> same bucket", async () => {
    const a = await computeBucketId(PEPPER, "Café Joe's", MAD_A.lat, MAD_A.lng);
    const b = await computeBucketId(PEPPER, "cafe joes", MAD_A.lat, MAD_A.lng);
    expect(a).toBe(b);
  });

  it("same venue with GPS jitter (same cell) -> same bucket", async () => {
    const a = await computeBucketId(PEPPER, "Joe's Pizza", MAD_A.lat, MAD_A.lng);
    const b = await computeBucketId(PEPPER, "Joe's Pizza", MAD_B.lat, MAD_B.lng);
    expect(a).toBe(b);
  });

  it("different venues in the same cell -> different buckets", async () => {
    const a = await computeBucketId(PEPPER, "Joe's Pizza", MAD_A.lat, MAD_A.lng);
    const b = await computeBucketId(PEPPER, "Mario's Tacos", MAD_A.lat, MAD_A.lng);
    expect(a).not.toBe(b);
  });

  it("same name in different cities -> different buckets", async () => {
    const a = await computeBucketId(PEPPER, "Joe's Pizza", MAD_A.lat, MAD_A.lng);
    const b = await computeBucketId(PEPPER, "Joe's Pizza", NYC.lat, NYC.lng);
    expect(a).not.toBe(b);
  });

  it("a different pepper yields a different bucket (DB leak without the pepper is useless)", async () => {
    const a = await computeBucketId(PEPPER, "Joe's Pizza", MAD_A.lat, MAD_A.lng);
    const b = await computeBucketId("a-different-pepper", "Joe's Pizza", MAD_A.lat, MAD_A.lng);
    expect(a).not.toBe(b);
  });

  it("leaks nothing identifying in the output", async () => {
    const id = await computeBucketId(PEPPER, "Joe's Pizza", MAD_A.lat, MAD_A.lng);
    expect(id.toLowerCase()).not.toContain("joe");
    expect(id).not.toContain("43");
    expect(id).not.toContain("89");
  });

  it("requires a pepper", async () => {
    await expect(computeBucketId("", "Joe's Pizza", MAD_A.lat, MAD_A.lng)).rejects.toThrow();
  });
});
