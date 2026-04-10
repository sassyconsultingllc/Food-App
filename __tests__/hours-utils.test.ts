/**
 * Hours Utilities Tests
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isOpenNow, getTodayHours, getOpenStatus, getClosingTime } from "../utils/hours-utils";
import { HoursOfOperation } from "../types/restaurant";

describe("Hours Utilities", () => {
  const mockHours: HoursOfOperation = {
    monday: "10:00 AM - 10:00 PM",
    tuesday: "10:00 AM - 10:00 PM",
    wednesday: "10:00 AM - 10:00 PM",
    thursday: "10:00 AM - 10:00 PM",
    friday: "10:00 AM - 11:00 PM",
    saturday: "9:00 AM - 11:00 PM",
    sunday: "11:00 AM - 9:00 PM",
  };

  describe("isOpenNow", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return true when restaurant is open", () => {
      // Set to Monday at 2:00 PM
      vi.setSystemTime(new Date(2025, 11, 22, 14, 0, 0)); // Monday Dec 22, 2025 at 2 PM
      expect(isOpenNow(mockHours)).toBe(true);
    });

    it("should return false when restaurant is closed", () => {
      // Set to Monday at 8:00 AM (before opening)
      vi.setSystemTime(new Date(2025, 11, 22, 8, 0, 0));
      expect(isOpenNow(mockHours)).toBe(false);
    });

    it("should return true when hours are undefined (assumes open)", () => {
      expect(isOpenNow(undefined)).toBe(true);
    });

    it("should handle closed days", () => {
      const hoursWithClosedDay: HoursOfOperation = {
        ...mockHours,
        sunday: "Closed",
      };
      // Set to Sunday
      vi.setSystemTime(new Date(2025, 11, 21, 14, 0, 0)); // Sunday Dec 21, 2025
      expect(isOpenNow(hoursWithClosedDay)).toBe(false);
    });
  });

  describe("getTodayHours", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return today's hours string", () => {
      // Set to Monday
      vi.setSystemTime(new Date(2025, 11, 22, 14, 0, 0));
      expect(getTodayHours(mockHours)).toBe("10:00 AM - 10:00 PM");
    });

    it("should return 'Hours not available' when hours are undefined", () => {
      expect(getTodayHours(undefined)).toBe("Hours not available");
    });
  });

  describe("getOpenStatus", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return correct status when open", () => {
      vi.setSystemTime(new Date(2025, 11, 22, 14, 0, 0));
      const status = getOpenStatus(mockHours);
      expect(status.isOpen).toBe(true);
      expect(status.statusText).toBe("Open");
      expect(status.todayHours).toBe("10:00 AM - 10:00 PM");
    });

    it("should return correct status when closed", () => {
      vi.setSystemTime(new Date(2025, 11, 22, 8, 0, 0));
      const status = getOpenStatus(mockHours);
      expect(status.isOpen).toBe(false);
      expect(status.statusText).toBe("Closed");
    });

    it("should handle unknown hours", () => {
      const status = getOpenStatus(undefined);
      expect(status.isOpen).toBe(false);
      expect(status.statusText).toBe("Hours unknown");
    });
  });

  describe("getClosingTime", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return closing time", () => {
      vi.setSystemTime(new Date(2025, 11, 22, 14, 0, 0)); // Monday
      expect(getClosingTime(mockHours)).toBe("10:00PM");
    });

    it("should return null when hours are undefined", () => {
      expect(getClosingTime(undefined)).toBe(null);
    });
  });
});
