// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.

/**
 * Country the request came from, per Cloudflare (`request.cf.country`).
 * "XX" means unknown and "T1" means Tor, so neither counts.
 */
export function requestCountry(req?: Request): string | undefined {
  const c = (req as { cf?: { country?: unknown } } | undefined)?.cf?.country;
  return typeof c === "string" && /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1"
    ? c
    : undefined;
}
