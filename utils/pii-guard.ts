/**
 * Content Guard — PII detection + content moderation
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Client-side screening for public notes:
 *  1. PII detection (phone, email, SSN, etc.) — warns, doesn't block
 *  2. Content moderation (profanity, slurs, threats, etc.) — blocks submission
 *
 * All checks run locally. No data is sent anywhere.
 */

// ---------------------------------------------------------------------------
// PII Detection
// ---------------------------------------------------------------------------

const PII_PATTERNS: { label: string; regex: RegExp }[] = [
  {
    label: "phone number",
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  },
  {
    label: "email address",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  },
  {
    label: "Social Security number",
    regex: /\b\d{3}-\d{2}-\d{4}\b/,
  },
  {
    label: "credit card number",
    regex: /\b(?:\d[-\s]?){13,19}\b/,
  },
  {
    label: "street address",
    regex: /\b\d{1,5}\s+[A-Z][a-zA-Z]+\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Way|Pl|Place)\b/i,
  },
];

export interface PIICheckResult {
  hasPII: boolean;
  detected: string[];
  warning: string;
}

/**
 * Scan text for potential PII. Returns advisory warning — does NOT block.
 */
export function checkForPII(text: string): PIICheckResult {
  if (!text || text.trim().length === 0) {
    return { hasPII: false, detected: [], warning: "" };
  }

  const detected: string[] = [];
  for (const { label, regex } of PII_PATTERNS) {
    if (regex.test(text)) {
      detected.push(label);
    }
  }

  if (detected.length === 0) {
    return { hasPII: false, detected: [], warning: "" };
  }

  const list = detected.join(", ");
  return {
    hasPII: true,
    detected,
    warning: `Heads up — this looks like it may contain a ${list}. Public notes are visible to everyone.`,
  };
}

// ---------------------------------------------------------------------------
// Content Moderation
// ---------------------------------------------------------------------------

/**
 * Word list stored as base64-ish fragments to avoid triggering lint
 * rules on raw profanity. Each entry is a regex pattern (case-insensitive).
 *
 * Categories:
 *  - Profanity / vulgarity
 *  - Racial & ethnic slurs
 *  - Threats / violence references
 *  - Drug references (in context of promoting use)
 *  - Targeting individuals by name ("fire [name]", "[name] sucks")
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // --- Profanity (common variants with leet-speak) ---
  /\bf+[u\*@]+c+k/i,
  /\bs+h+[i1!]+t/i,
  /\ba+s+s+h+o+l+e/i,
  /\bb+[i1!]+t+c+h/i,
  /\bd+[i1!]+c+k/i,
  /\bc+u+n+t/i,
  /\bw+h+o+r+e/i,
  /\bd+a+m+n/i,

  // --- Racial / ethnic slurs (partial patterns to catch variants) ---
  /\bn+[i1!]+g+g/i,
  /\bsp+[i1!]+c+k?\b/i,
  /\bch+[i1!]+n+k/i,
  /\bk+[i1!]+k+e/i,
  /\bw+e+t+b+a+c+k/i,
  /\bg+o+o+k\b/i,
  /\br+e+t+a+r+d/i,
  /\bf+a+g+(?:g+o+t+)?/i,
  /\bt+r+a+n+n+y/i,

  // --- Violence / threats ---
  /\b(?:kill|shoot|stab|murder|bomb)\s+(?:them|him|her|you|the)/i,
  /\b(?:i'?ll|gonna|going\s+to)\s+(?:kill|shoot|stab|hurt|beat)/i,
  /\bbring\s+(?:a\s+)?gun/i,
  /\bshoot\s*(?:up|this|the)/i,

  // --- Drug promotion ---
  /\b(?:sell(?:ing)?|buy(?:ing)?|smok(?:e|ing))\s+(?:meth|crack|heroin|coke|cocaine|fentanyl|pills)\b/i,

  // --- Targeted harassment of staff ---
  // Narrowly scoped so "fire sauce", "fire grilled", "food sucks", etc.
  // pass through — the server-side guard uses identical patterns.
  /\bfire\s+(?:the\s+|that\s+)?(?:staff|manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender|employee)\b/i,
  /\b(?:the\s+)?(?:manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender)\s+(?:is\s+)?(?:an?\s+)?(?:idiot|moron|stupid|worthless|trash|garbage)\b/i,
];

export interface ModerationResult {
  blocked: boolean;
  reason: string;
}

/**
 * Screen text for prohibited content. Returns block decision.
 * This DOES prevent submission when triggered.
 */
export function moderateContent(text: string): ModerationResult {
  if (!text || text.trim().length === 0) {
    return { blocked: false, reason: "" };
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        blocked: true,
        reason:
          "This note contains language that isn't allowed in public comments. Please keep it respectful and helpful for other diners.",
      };
    }
  }

  return { blocked: false, reason: "" };
}

// ---------------------------------------------------------------------------
// Combined check (convenience)
// ---------------------------------------------------------------------------

export interface ContentCheckResult {
  /** Hard block — submission should be prevented. */
  blocked: boolean;
  blockReason: string;
  /** Soft warning — PII detected, user can proceed. */
  piiWarning: string;
  piiDetected: string[];
}

/**
 * Run both PII detection and content moderation in one call.
 */
export function checkPublicNote(text: string): ContentCheckResult {
  const mod = moderateContent(text);
  const pii = checkForPII(text);

  return {
    blocked: mod.blocked,
    blockReason: mod.reason,
    piiWarning: pii.warning,
    piiDetected: pii.detected,
  };
}
