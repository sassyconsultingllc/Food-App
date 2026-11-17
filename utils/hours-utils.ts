// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-HLBWOGWGKYYG
/**
 * Restaurant Hours Utilities
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Check if restaurants are currently open based on their hours.
 */

import { HoursOfOperation } from "@/types/restaurant";
import { normalizeHours } from "@/utils/culvers-hours";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Resolve "now" as the wall clock at the restaurant.
 *
 * Hours strings are in the restaurant's LOCAL time, so comparing them
 * against the device clock is wrong whenever the two differ — searching a
 * distant postal code showed places as open/closed on the searcher's
 * timezone. When we know the restaurant's UTC offset (Google Places
 * `utc_offset_minutes`), shift UTC by it and read the result with getUTC*
 * accessors. Without an offset, fall back to device-local time.
 */
function localNowAt(utcOffsetMinutes?: number): { day: number; minutes: number } {
  if (typeof utcOffsetMinutes === "number" && Number.isFinite(utcOffsetMinutes)) {
    const shifted = new Date(Date.now() + utcOffsetMinutes * 60_000);
    return {
      day: shifted.getUTCDay(),
      minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
  }
  const now = new Date();
  return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
}

/**
 * Check if a restaurant is currently open.
 *
 * @param utcOffsetMinutes Restaurant's offset from UTC. Pass
 *   `restaurant.utcOffsetMinutes` so the check runs on the restaurant's
 *   clock rather than the device's.
 */
export function isRestaurantOpenNow(
  hours?: HoursOfOperation,
  utcOffsetMinutes?: number
): boolean {
  // Favorites saved by older builds can hold Culver's raw hours string.
  hours = normalizeHours(hours) as HoursOfOperation | undefined;
  if (!hours) return true; // Assume open if no hours data

  const now = localNowAt(utcOffsetMinutes);
  const dayName = DAY_NAMES[now.day] as keyof HoursOfOperation;
  const todayHours = hours[dayName];
  
  if (!todayHours) return true; // Assume open if no hours for today
  
  // Handle "Closed" or similar
  if (todayHours.toLowerCase().includes("closed")) return false;
  
  // Parse hours string - common formats:
  // "11:00 AM - 10:00 PM"
  // "11:00 - 22:00"
  // "11am - 10pm"
  // "11:00am-10:00pm"
  // "11:00 AM – 2:00 PM, 5:00 – 9:00 PM" (split shift — every range counts)

  try {
    const ranges = parseDayRanges(todayHours);
    if (ranges.length === 0) return true; // Can't parse, assume open

    return ranges.some((range) => isWithinRange(now.minutes, range));
  } catch {
    return true; // Error parsing, assume open
  }
}

// Alias for backward compatibility
export const isOpenNow = isRestaurantOpenNow;

/**
 * Parse time to minutes from midnight.
 *
 * `is24h` is set by the caller when the pair is unambiguously 24-hour
 * (neither side has am/pm, and one side has an hour >12 or 0). In that
 * case we treat the hour literally and never add 12. The old code used
 * to add 12 whenever hour ≤ 6 with no am/pm, which turned a European
 * "06:00 - 14:00" breakfast spot into "18:00 - 02:00".
 */
function parseTime(hour: number, minutes: number, amPm?: string, is24h = false): number {
  let h = hour;

  if (amPm) {
    const isPm = amPm.toLowerCase() === "pm";
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
  } else if (!is24h) {
    // Ambiguous: hour > 12 is already correct. Only fall back to the old
    // "1-6 probably means 1pm-6pm" heuristic when we have NO evidence that
    // the string is 24h (i.e. both hours are ≤ 12 and neither is 0).
    if (h <= 6) h += 12;
  }

  return h * 60 + minutes;
}

const DAY_MINUTES = 24 * 60;

interface ParsedRange {
  /** Minutes from local midnight. `close` runs past 1440 for overnight ranges. */
  open: number;
  close: number;
  /** Times as written, e.g. "11:00 AM" / "22:00", for status labels. */
  openLabel: string;
  closeLabel: string;
}

/** "10" + "00" + "pm" → "10:00 PM"; 24h strings carry no suffix → "22:00". */
function formatTimeLabel(hour: string, minutes?: string, amPm?: string): string {
  return `${hour}${minutes ? ":" + minutes : ""}${amPm ? " " + amPm.toUpperCase() : ""}`;
}

/**
 * Parse every open–close range in one day's hours string.
 *
 * A day can hold more than one range: Google writes split shifts as
 * "11:00 AM – 2:00 PM, 5:00 – 9:00 PM" and Foursquare as
 * "11:00 - 14:00, 17:00 - 22:00". Reading only the first range reported those
 * places as closed all evening, and the Open Now filter hid them. Returns []
 * when nothing parses; callers treat that as "unknown, assume open".
 */
function parseDayRanges(dayHours: string): ParsedRange[] {
  const ranges: ParsedRange[] = [];

  for (const segment of dayHours.split(/[,;]/)) {
    const match = segment.match(
      /(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i
    );
    if (!match) continue;

    const [, openHour, openMinRaw, openAmPm, closeHour, closeMinRaw, closeAmPm] = match;
    const openMin = parseInt(openMinRaw ?? "00");
    const closeMin = parseInt(closeMinRaw ?? "00");

    // Detect 24-hour format: if neither side has am/pm AND any hour exceeds
    // 12, the string must be 24h and the old "hour ≤ 6 → add 12" heuristic
    // would wrongly push a 6am opening to 6pm. Skip the heuristic in that case.
    const noAmPm = !openAmPm && !closeAmPm;
    const openH = parseInt(openHour);
    const closeH = parseInt(closeHour);
    const is24h = noAmPm && (openH > 12 || closeH > 12 || openH === 0 || closeH === 0);

    let openTime = parseTime(openH, openMin, openAmPm, is24h);
    // Don't carry the OPEN side's am/pm to the close side — "11am-2" means
    // 2pm, not 2am. With closeAmPm undefined, parseTime's hour-≤6 heuristic
    // resolves it correctly.
    let closeTime = parseTime(closeH, closeMin, closeAmPm, is24h);

    // The other direction does carry: Google drops a repeated am/pm, so
    // "7:00 – 10:00 PM" opens at 7pm, not 7am. Only when that reads as a
    // forward range, though — "11 - 2pm" still opens at 11am.
    let openSuffix: string | undefined = openAmPm;
    if (!openAmPm && closeAmPm) {
      const shared = parseTime(openH, openMin, closeAmPm);
      if (shared < closeTime) {
        openTime = shared;
        openSuffix = closeAmPm;
      }
    }

    // Handle overnight hours (e.g., 11am - 2am)
    if (closeTime <= openTime) {
      closeTime += DAY_MINUTES;
    }

    ranges.push({
      open: openTime,
      close: closeTime,
      openLabel: formatTimeLabel(openHour, openMinRaw, openSuffix),
      closeLabel: formatTimeLabel(closeHour, closeMinRaw, closeAmPm),
    });
  }

  return ranges;
}

function isWithinRange(minutes: number, range: ParsedRange): boolean {
  if (minutes >= range.open && minutes <= range.close) return true;
  // Past midnight but still inside an overnight range.
  return range.close > DAY_MINUTES && minutes + DAY_MINUTES <= range.close;
}

/**
 * Day key ("monday" … "sunday") for "today" on the restaurant's clock — the
 * same clock isRestaurantOpenNow and getOpenStatus use.
 */
export function getLocalDayKey(utcOffsetMinutes?: number): keyof HoursOfOperation {
  return DAY_NAMES[localNowAt(utcOffsetMinutes).day] as keyof HoursOfOperation;
}

/**
 * Get human-readable status
 */
export function getOpenStatus(
  hours?: HoursOfOperation,
  utcOffsetMinutes?: number
): {
  isOpen: boolean;
  statusText: string;
  nextChange?: string;
  todayHours?: string;
} {
  hours = normalizeHours(hours) as HoursOfOperation | undefined;
  if (!hours) {
    return { isOpen: false, statusText: "Hours unknown" };
  }

  // Same restaurant-local clock as isRestaurantOpenNow — otherwise the
  // badge could name a different day's hours than the open/closed verdict.
  const now = localNowAt(utcOffsetMinutes);
  const dayName = DAY_NAMES[now.day] as keyof HoursOfOperation;
  const todayHoursStr = hours[dayName];

  // isRestaurantOpenNow assumes "open" when it can't tell, which suits the
  // open-now filter but made the badge say "Open" for hours it couldn't
  // read. The badge only says Open or Closed when it knows.
  if (todayHoursStr && !/closed/i.test(todayHoursStr)) {
    if (/24\s*h|24\/7|open 24/i.test(todayHoursStr)) {
      return { isOpen: true, statusText: "Open 24 hours", todayHours: todayHoursStr };
    }
    if (!/\d{1,2}:?(\d{2})?\s*(am|pm)?\s*[-–to]+\s*\d{1,2}/i.test(todayHoursStr)) {
      return { isOpen: false, statusText: "Hours unknown", todayHours: todayHoursStr };
    }
  }

  // No entry for today while other days have one means closed today, which
  // the closed branch below handles.
  const isOpen = !!todayHoursStr && isRestaurantOpenNow(hours, utcOffsetMinutes);
  if (isOpen) {
    // Name the closing time of the range we are actually inside — on a
    // split-shift day the first range's close is the wrong answer at dinner.
    const active = todayHoursStr
      ? parseDayRanges(todayHoursStr).find((range) => isWithinRange(now.minutes, range))
      : undefined;

    if (active) {
      return {
        isOpen: true,
        statusText: "Open",
        nextChange: `Closes at ${active.closeLabel}`,
        todayHours: todayHoursStr,
      };
    }

    return { isOpen: true, statusText: "Open now", todayHours: todayHoursStr };
  }

  // Closed - find the next opening (restaurant-local day, see localNowAt).
  // Today only counts for ranges that haven't started yet: after closing time
  // "Opens today at 10:00 AM" would point at an opening that already passed.
  const todayIndex = now.day;

  // i === 7 is this same weekday next week, for places open one day a week.
  for (let i = 0; i <= 7; i++) {
    const checkDay = (todayIndex + i) % 7;
    const checkDayName = DAY_NAMES[checkDay] as keyof HoursOfOperation;
    const dayHours = hours[checkDayName];

    if (!dayHours || dayHours.toLowerCase().includes("closed")) continue;

    const next = parseDayRanges(dayHours).find(
      (range) => i > 0 || range.open > now.minutes
    );

    if (next) {
      const dayLabel =
        i === 0
          ? "today"
          : i === 1
            ? "tomorrow"
            : DAY_NAMES[checkDay].charAt(0).toUpperCase() + DAY_NAMES[checkDay].slice(1);
      return {
        isOpen: false,
        statusText: "Closed",
        nextChange: `Opens ${dayLabel} at ${next.openLabel}`,
        todayHours: todayHoursStr,
      };
    }
  }

  return { isOpen: false, statusText: "Closed", todayHours: todayHoursStr };
}

/**
 * Format hours for display
 */
export function formatHoursForDay(hours?: HoursOfOperation, dayIndex?: number): string {
  if (!hours) return "Hours not available";
  
  const targetDay = dayIndex ?? new Date().getDay();
  const dayName = DAY_NAMES[targetDay] as keyof HoursOfOperation;
  const dayHours = hours[dayName];
  
  if (!dayHours) return "Hours not available";
  
  return dayHours;
}

/**
 * Get all hours formatted for display
 */
export function formatAllHours(hours?: HoursOfOperation): { day: string; hours: string }[] {
  if (!hours) return [];
  
  return DAY_NAMES.map((day, index) => ({
    day: day.charAt(0).toUpperCase() + day.slice(1),
    hours: hours[day as keyof HoursOfOperation] || "Closed",
  }));
}

/**
 * Get today's hours string
 */
export function getTodayHours(hours?: HoursOfOperation): string {
  return formatHoursForDay(hours);
}

/**
 * Get closing time for today
 */
export function getClosingTime(hours?: HoursOfOperation): string | null {
  if (!hours) return null;
  
  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()] as keyof HoursOfOperation;
  const todayHours = hours[dayName];
  
  if (!todayHours) return null;
  
  const closeMatch = todayHours.match(/[-–to]+\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!closeMatch) return null;
  
  return `${closeMatch[1]}${closeMatch[2] ? ":" + closeMatch[2] : ":00"}${closeMatch[3] || ""}`;
}
