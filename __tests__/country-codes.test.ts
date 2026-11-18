// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
import { describe, expect, it } from "vitest";
import { alpha2 } from "../worker/country-codes";
import { normalizeRestaurantName } from "../worker/restaurant-bucket";

describe("alpha2", () => {
  it("maps HERE's alpha-3 codes", () => {
    expect(alpha2("USA")).toBe("US");
    expect(alpha2("fra")).toBe("FR");
    expect(alpha2("SAU")).toBe("SA");
    expect(alpha2("KOR")).toBe("KR");
    expect(alpha2("TWN")).toBe("TW");
  });
  it("passes alpha-2 through and rejects junk", () => {
    expect(alpha2("de")).toBe("DE");
    expect(alpha2("ZZZ")).toBeUndefined();
    expect(alpha2("")).toBeUndefined();
    expect(alpha2(undefined)).toBeUndefined();
  });
});

describe("normalizeRestaurantName (used by the Worker merge)", () => {
  it("keeps names in non-Latin scripts", () => {
    for (const n of ["مطعم البيك", "명동교자", "南翔馒头店", "ร้านอาหาร", "Пушкинъ", "Ταβέρνα", "すし匠"]) {
      expect(normalizeRestaurantName(n)).not.toBe("");
    }
  });
  it("still merges Latin spellings", () => {
    expect(normalizeRestaurantName("Café de Flore")).toBe(normalizeRestaurantName("cafe de flore"));
  });
});
