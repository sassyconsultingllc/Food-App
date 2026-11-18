// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeHours } from "../utils/culvers-hours";
import { getOpenStatus, isRestaurantOpenNow } from "../utils/hours-utils";
import { transformServerRestaurant } from "../utils/restaurant-transform";
import type { HoursOfOperation } from "../types/restaurant";

// Exactly what the Culver's locator returns in metadata.dineInHours.
const RAW =
  '{"MoO":"10:00 AM","MoC":"11:00 PM","TuO":"10:00 AM","TuC":"11:00 PM","WeO":"10:00 AM","WeC":"11:00 PM",' +
  '"ThO":"10:00 AM","ThC":"11:00 PM","FrO":"10:00 AM","FrC":"11:00 PM","SaO":"10:00 AM","SaC":"11:00 PM",' +
  '"SuO":"10:00 AM","SuC":"11:00 PM"}';
const CENTRAL_CDT = -300;

describe("normalizeHours", () => {
  it("converts the Culver's locator format", () => {
    expect(normalizeHours(RAW)).toMatchObject({ monday: "10:00 AM - 11:00 PM", sunday: "10:00 AM - 11:00 PM" });
  });
  it("passes the app format through and rejects junk", () => {
    expect(normalizeHours({ monday: "9 - 5" })).toEqual({ monday: "9 - 5" });
    expect(normalizeHours("not json")).toBeUndefined();
    expect(normalizeHours("")).toBeUndefined();
    expect(normalizeHours(undefined)).toBeUndefined();
  });
});

describe("Culver's open status", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is closed at 3 AM store time even given the raw string", () => {
    // Tue 2026-10-27 08:00 UTC = 03:00 CDT
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 8, 0)));
    const hours = RAW as unknown as HoursOfOperation;
    expect(isRestaurantOpenNow(hours, CENTRAL_CDT)).toBe(false);
    expect(getOpenStatus(hours, CENTRAL_CDT).statusText).toBe("Closed");
  });

  it("is open at noon store time", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 17, 0)));
    expect(getOpenStatus(normalizeHours(RAW), CENTRAL_CDT).isOpen).toBe(true);
  });

  it("does not claim Open for hours it can't read", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 17, 0)));
    const s = getOpenStatus({ tuesday: "Varies", monday: "Varies" }, CENTRAL_CDT);
    expect(s.isOpen).toBe(false);
    expect(s.statusText).toBe("Hours unknown");
  });

  it("transform keeps the offset and normalizes hours", () => {
    const r = transformServerRestaurant({ id: "culvers_1", name: "Culver's", hours: RAW, utcOffsetMinutes: CENTRAL_CDT });
    expect(r.utcOffsetMinutes).toBe(CENTRAL_CDT);
    expect(r.hours?.monday).toBe("10:00 AM - 11:00 PM");
  });
});
