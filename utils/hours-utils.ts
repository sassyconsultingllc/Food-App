/**
 * Restaurant Hours Utilities
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Check if restaurants are currently open based on their hours.
 */

import { HoursOfOperation } from "@/types/restaurant";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Check if a restaurant is currently open
 */
export function isRestaurantOpenNow(hours?: HoursOfOperation): boolean {
  if (!hours) return true; // Assume open if no hours data
  
  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()] as keyof HoursOfOperation;
  const todayHours = hours[dayName];
  
  if (!todayHours) return true; // Assume open if no hours for today
  
  // Handle "Closed" or similar
  if (todayHours.toLowerCase().includes("closed")) return false;
  
  // Parse hours string - common formats:
  // "11:00 AM - 10:00 PM"
  // "11:00 - 22:00"
  // "11am - 10pm"
  // "11:00am-10:00pm"
  
  try {
    const timeRangeMatch = todayHours.match(
      /(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i
    );
    
    if (!timeRangeMatch) return true; // Can't parse, assume open
    
    const [, openHour, openMin = "00", openAmPm, closeHour, closeMin = "00", closeAmPm] = timeRangeMatch;
    
    const openTime = parseTime(parseInt(openHour), parseInt(openMin), openAmPm);
    let closeTime = parseTime(parseInt(closeHour), parseInt(closeMin), closeAmPm || openAmPm);
    
    // Handle overnight hours (e.g., 11am - 2am)
    if (closeTime <= openTime) {
      closeTime += 24 * 60; // Add 24 hours
    }
    
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Check if current time is within range
    if (currentMinutes >= openTime && currentMinutes <= closeTime) {
      return true;
    }
    
    // Also check if we're past midnight but still within range
    if (closeTime > 24 * 60 && currentMinutes + 24 * 60 <= closeTime) {
      return true;
    }
    
    return false;
  } catch {
    return true; // Error parsing, assume open
  }
}

// Alias for backward compatibility
export const isOpenNow = isRestaurantOpenNow;

/**
 * Parse time to minutes from midnight
 */
function parseTime(hour: number, minutes: number, amPm?: string): number {
  let h = hour;
  
  if (amPm) {
    const isPm = amPm.toLowerCase() === "pm";
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
  } else {
    // 24-hour format - if hour > 12, it's already correct
    // if hour <= 12, we need context (assume PM for evening hours)
    if (h <= 6) h += 12; // 1-6 probably means 1pm-6pm
  }
  
  return h * 60 + minutes;
}

/**
 * Get human-readable status
 */
export function getOpenStatus(hours?: HoursOfOperation): {
  isOpen: boolean;
  statusText: string;
  nextChange?: string;
  todayHours?: string;
} {
  if (!hours) {
    return { isOpen: false, statusText: "Hours unknown" };
  }
  
  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()] as keyof HoursOfOperation;
  const todayHoursStr = hours[dayName];
  
  const isOpen = isRestaurantOpenNow(hours);
  
  if (isOpen) {
    // Try to find closing time
    if (todayHoursStr) {
      const closeMatch = todayHoursStr.match(
        /[-–to]+\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i
      );
      
      if (closeMatch) {
        return {
          isOpen: true,
          statusText: "Open",
          nextChange: `Closes at ${closeMatch[1]}${closeMatch[2] ? ":" + closeMatch[2] : ""}${closeMatch[3] || ""}`,
          todayHours: todayHoursStr,
        };
      }
    }
    
    return { isOpen: true, statusText: "Open now", todayHours: todayHoursStr };
  }
  
  // Closed - try to find opening time
  const todayIndex = now.getDay();
  
  // Check today and next 7 days for opening
  for (let i = 0; i < 7; i++) {
    const checkDay = (todayIndex + i) % 7;
    const checkDayName = DAY_NAMES[checkDay] as keyof HoursOfOperation;
    const dayHours = hours[checkDayName];
    
    if (dayHours && !dayHours.toLowerCase().includes("closed")) {
      const openMatch = dayHours.match(
        /(\d{1,2}):?(\d{2})?\s*(am|pm)?/i
      );
      
      if (openMatch) {
        const dayLabel = i === 0 ? "today" : i === 1 ? "tomorrow" : DAY_NAMES[checkDay];
        return {
          isOpen: false,
          statusText: "Closed",
          nextChange: `Opens ${dayLabel} at ${openMatch[1]}${openMatch[2] ? ":" + openMatch[2] : ""}${openMatch[3] || ""}`,
          todayHours: todayHoursStr,
        };
      }
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
