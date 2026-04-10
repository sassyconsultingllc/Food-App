/**
 * Address Utilities
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Handles address formatting and deduplication for display.
 */

/**
 * Build a display-friendly address string that avoids duplicating
 * city/state/zip when they already appear in the street address field.
 */
export function formatDisplayAddress(
  address: string,
  city: string,
  state: string,
  zipCode: string
): string {
  if (!address) {
    // No street address — build from components
    const parts = [city, state].filter(Boolean);
    const csz = parts.join(', ') + (zipCode ? ` ${zipCode}` : '');
    return csz.trim() || 'Address unavailable';
  }

  const lower = address.toLowerCase();
  const hasCity = city && lower.includes(city.toLowerCase());
  const hasState = state && (
    lower.includes(state.toLowerCase()) ||
    lower.includes(getStateAbbr(state).toLowerCase())
  );
  const hasZip = zipCode && lower.includes(zipCode.replace(/-\d+$/, ''));

  // If address already contains city+state or city+zip, it's a full address
  if (hasCity && (hasState || hasZip)) {
    return address;
  }

  // Otherwise append missing components
  const suffix = [city, state].filter(Boolean).join(', ') + (zipCode ? ` ${zipCode}` : '');
  return suffix ? `${address}, ${suffix.trim()}` : address;
}

/**
 * Build a maps-safe address query string (always includes all components).
 */
export function formatMapsAddress(
  address: string,
  city: string,
  state: string,
  zipCode: string
): string {
  return [address, city, state, zipCode].filter(Boolean).join(', ');
}

/** Simple state name → abbreviation for common US states */
function getStateAbbr(state: string): string {
  const map: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY',
  };
  return map[state.toLowerCase()] || state;
}
