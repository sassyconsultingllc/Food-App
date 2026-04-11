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

// Client-side patterns are non-global (single match per call) so they do
// NOT suffer from the /g lastIndex state leakage that affects the worker's
// PII scrubber. They still match the same shapes the server guards against
// so the user's on-device warning matches the server's actual decision.
const PII_PATTERNS: { label: string; regex: RegExp }[] = [
  {
    label: "phone number",
    // US + intl: word boundaries, 10+ digit minimum, optional country code.
    regex: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}\b/,
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
    // Require 3-4 groups of 4 digits separated by space/hyphen — matches
    // real card formats without tripping on order numbers, UPCs, etc.
    regex: /\b(?:\d{4}[-\s]?){3,4}\d{1,4}\b/,
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
// MUST stay in sync with worker/content-guard.ts BLOCKED_PATTERNS. The
// server guard is authoritative, but UX depends on the client warning
// the same set so users don't submit a note that's going to be rejected.
// Run against BOTH normalizeForModeration(raw) and its collapsed variant
// so homoglyphs and interstitial chars (f u c k, f.u.c.k) are caught.
const BLOCKED_PATTERNS: RegExp[] = [
  // --- Profanity — widened to cover phuck/fvck/fuk family ---
  /\bf+[uv\*@0]*c*k+/i,
  /\bs+h+[i1!]+t/i,
  /\ba+s+s+h+o+l+e/i,
  /\bb+[i1!]+t+c+h/i,
  /\bd+[i1!]+c+k/i,
  /\bc+u+n+t/i,
  /\bw+h+o+r+e/i,
  // "damn" was client-only — dropped so client+server decisions match.

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

  // --- Violence / threats — require an explicit target so idioms like
  // "gonna kill this burrito" / "going to beat the heat" don't trigger. ---
  /\b(?:kill|shoot|stab|murder|bomb)\s+(?:them|him|her|you|the\s+(?:staff|manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender|employee|customer|guy|girl|woman|man|people))/i,
  /\b(?:i'?ll|gonna|going\s+to)\s+(?:kill|shoot|stab|hurt|beat)\s+(?:them|him|her|you|someone|everybody|everyone|people|the\s+(?:staff|manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender|employee|customer))/i,
  /\bbring\s+(?:a\s+)?gun/i,
  /\bshoot\s*(?:up)\s+(?:this|the)\b/i,

  // --- Drug promotion ---
  /\b(?:sell(?:ing)?|buy(?:ing)?|smok(?:e|ing))\s+(?:meth|crack|heroin|coke|cocaine|fentanyl|pills)\b/i,

  // --- Targeted harassment of staff ---
  /\bfire\s+(?:the\s+|that\s+)?(?:staff|manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender|employee)\b/i,
  /\b(?:the\s+)?(?:manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender)\s+(?:is\s+|iz\s+)?(?:an?\s+)?(?:idiot|moron|stupid|worthless|trash|garbage)\b/i,
];

// Mirror worker/content-guard.ts normalizeForModeration + collapse. Kept
// in a tiny inline form so this file stays dependency-free.
const CONFUSABLES_TO_LATIN: Record<string, string> = {
  "а": "a", "в": "b", "с": "c", "е": "e", "һ": "h", "і": "i", "ј": "j",
  "к": "k", "м": "m", "о": "o", "р": "p", "ѕ": "s", "т": "t", "у": "y",
  "х": "x", "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "І": "I",
  "Ј": "J", "К": "K", "М": "M", "О": "O", "Р": "P", "Ѕ": "S", "Т": "T",
  "У": "Y", "Х": "X", "υ": "u", "ι": "i", "ο": "o", "α": "a", "ϲ": "c",
  "ρ": "p", "τ": "t", "ν": "v", "γ": "y", "η": "n",
  "ı": "i", "İ": "I",
  "ա": "a", "ո": "o", "ս": "s",
  "Ꭺ": "A", "Ꭼ": "E", "Ꭻ": "J", "Ꮃ": "W", "Ꮯ": "C", "Ꮖ": "P",
  "ƨ": "s", "ʂ": "s", "ꜱ": "s", "ʃ": "s",
};
const ZW_RE_LOCAL =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2028\u2029\u205F\u2060-\u2064\u206A-\u206F\u3164\uFEFF\uFFA0]/g;

function normalizeForModerationLocal(raw: string): string {
  let s = (raw || "").normalize("NFKC").replace(ZW_RE_LOCAL, "");
  s = Array.from(s).map((ch) => CONFUSABLES_TO_LATIN[ch] ?? ch).join("");
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
  return s;
}
function collapseForModerationLocal(n: string): string {
  return n.replace(/[\s._\-*·•]+/g, "");
}

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

  const normalized = normalizeForModerationLocal(text);
  const collapsed = collapseForModerationLocal(normalized);
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(collapsed)) {
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
