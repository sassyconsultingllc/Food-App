// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Hours normalization shared by the Worker and the app (no imports, so both
 * bundles can use it).
 *
 * Culver's locator returns hours as a JSON string keyed by day + open/close:
 * '{"MoO":"10:00 AM","MoC":"11:00 PM",...}'. The app expects
 * { monday: "10:00 AM - 11:00 PM" }. Fed the raw string, every open check
 * found no entry for today and fell back to "assume open", so every Culver's
 * showed as open around the clock.
 */

const DAYS: [string, string][] = [
  ["Mo", "monday"], ["Tu", "tuesday"], ["We", "wednesday"], ["Th", "thursday"],
  ["Fr", "friday"], ["Sa", "saturday"], ["Su", "sunday"],
];
const WEEK = new Set(DAYS.map(([, d]) => d));

/**
 * Return hours as { monday: "10:00 AM - 11:00 PM", ... }, accepting that
 * shape, Culver's open/close shape, or either as a JSON string.
 * Returns undefined when nothing usable is found.
 */
export function normalizeHours(raw: unknown): Record<string, string> | undefined {
  let h: unknown = raw;
  if (typeof h === "string") {
    try {
      h = JSON.parse(h);
    } catch {
      return undefined;
    }
  }
  if (!h || typeof h !== "object" || Array.isArray(h)) return undefined;
  const obj = h as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [abbr, day] of DAYS) {
    const open = obj[`${abbr}O`];
    const close = obj[`${abbr}C`];
    if (typeof open === "string" && typeof close === "string" && open && close) {
      out[day] = `${open} - ${close}`;
    } else if (typeof obj[day] === "string" && obj[day]) {
      out[day] = obj[day] as string;
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (WEEK.has(k) && typeof v === "string" && v && !out[k]) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
