// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Open-now must run on the RESTAURANT's clock, not the device's.
 *
 * Regression for: searching a distant postal code judged every restaurant
 * against the searcher's timezone, so places showed open when closed (and
 * vice versa) by however many hours separated them.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { isRestaurantOpenNow, getOpenStatus } from "../utils/hours-utils";

const HOURS_11_TO_22 = {
  sunday: "11:00 AM - 10:00 PM",
  monday: "11:00 AM - 10:00 PM",
  tuesday: "11:00 AM - 10:00 PM",
  wednesday: "11:00 AM - 10:00 PM",
  thursday: "11:00 AM - 10:00 PM",
  friday: "11:00 AM - 10:00 PM",
  saturday: "11:00 AM - 10:00 PM",
};

/** Freeze wall-clock to a known UTC instant. */
function freezeUtc(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isRestaurantOpenNow honors the restaurant's UTC offset", () => {
  it("is OPEN when it is midday at the restaurant", () => {
    // 20:00 UTC. In Chicago (UTC-5) that's 15:00 — inside 11:00–22:00.
    freezeUtc("2026-08-12T20:00:00Z");
    expect(isRestaurantOpenNow(HOURS_11_TO_22, -300)).toBe(true);
  });

  it("is CLOSED when the same instant is past closing at the restaurant", () => {
    // 20:00 UTC. In Tokyo (UTC+9) that's 05:00 next day — well before 11:00.
    freezeUtc("2026-08-12T20:00:00Z");
    expect(isRestaurantOpenNow(HOURS_11_TO_22, 540)).toBe(false);
  });

  it("distinguishes two timezones at one instant (the actual bug)", () => {
    // 03:00 UTC: 22:00 previous day in Chicago (closing, still open),
    // 12:00 same day in Tokyo (open). Both correct only with offsets.
    freezeUtc("2026-08-12T03:00:00Z");
    const chicago = isRestaurantOpenNow(HOURS_11_TO_22, -300);
    const tokyo = isRestaurantOpenNow(HOURS_11_TO_22, 540);
    expect(chicago).toBe(true);
    expect(tokyo).toBe(true);

    // 16:00 UTC: 11:00 Chicago (just opened) vs 01:00 Tokyo (closed).
    freezeUtc("2026-08-12T16:00:00Z");
    expect(isRestaurantOpenNow(HOURS_11_TO_22, -300)).toBe(true);
    expect(isRestaurantOpenNow(HOURS_11_TO_22, 540)).toBe(false);
  });

  it("rolls the DAY over, not just the hour", () => {
    // Sunday 23:00 UTC is already Monday 08:00 in Tokyo (UTC+9). A
    // Sunday-only closure must not leak into Monday's lookup.
    const closedSunday = { ...HOURS_11_TO_22, sunday: "Closed" };
    freezeUtc("2026-08-16T23:00:00Z"); // Sunday in UTC
    // Tokyo is on Monday now, and Monday is open (11:00-22:00) — but at
    // 08:00 local it hasn't opened yet, so closed for a different reason.
    expect(isRestaurantOpenNow(closedSunday, 540)).toBe(false);
    // Same instant, Chicago is still Sunday 18:00 → explicitly Closed.
    expect(isRestaurantOpenNow(closedSunday, -300)).toBe(false);
    // Tokyo at Monday 12:00 (03:00 UTC Monday) is open despite Sunday closure.
    freezeUtc("2026-08-17T03:00:00Z");
    expect(isRestaurantOpenNow(closedSunday, 540)).toBe(true);
  });

  it("falls back to device time when the offset is unknown", () => {
    // No offset → uses local clock; must not throw or misreport.
    expect(typeof isRestaurantOpenNow(HOURS_11_TO_22)).toBe("boolean");
    expect(typeof isRestaurantOpenNow(HOURS_11_TO_22, undefined)).toBe("boolean");
  });

  it("ignores a non-finite offset rather than producing an Invalid Date", () => {
    freezeUtc("2026-08-12T20:00:00Z");
    expect(typeof isRestaurantOpenNow(HOURS_11_TO_22, NaN)).toBe("boolean");
    expect(typeof isRestaurantOpenNow(HOURS_11_TO_22, Infinity)).toBe("boolean");
  });

  it("handles a half-hour offset (India, UTC+5:30)", () => {
    // 07:00 UTC → 12:30 in Kolkata, open.
    freezeUtc("2026-08-12T07:00:00Z");
    expect(isRestaurantOpenNow(HOURS_11_TO_22, 330)).toBe(true);
    // 04:00 UTC → 09:30 Kolkata, not open yet.
    freezeUtc("2026-08-12T04:00:00Z");
    expect(isRestaurantOpenNow(HOURS_11_TO_22, 330)).toBe(false);
  });
});

describe("getOpenStatus uses the same clock as isRestaurantOpenNow", () => {
  it("does not report open/closed against a different day than the hours shown", () => {
    // Sunday 23:00 UTC → Monday in Tokyo. Status must read Monday's row.
    const distinct = { ...HOURS_11_TO_22, sunday: "Closed" };
    freezeUtc("2026-08-17T03:00:00Z"); // Monday 12:00 Tokyo
    const status = getOpenStatus(distinct, 540);
    expect(status.isOpen).toBe(true);
    expect(status.statusText.toLowerCase()).not.toContain("hours unknown");
  });

  it("still works with no offset", () => {
    const status = getOpenStatus(HOURS_11_TO_22);
    expect(typeof status.isOpen).toBe("boolean");
  });
});
