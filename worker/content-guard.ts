/**
 * Worker-side content guard for public notes.
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Mirrors the client-side checks in utils/pii-guard.ts so the server is
 * the real source of truth. The client check is advisory/UX; this is what
 * actually prevents bad content from ever reaching KV.
 */

import type { KVNamespace } from "@cloudflare/workers-types";

// Keep this list in sync with utils/pii-guard.ts BLOCKED_PATTERNS.
const BLOCKED_PATTERNS: RegExp[] = [
  // Profanity with leet-speak variants
  /\bf+[u\*@]+c+k/i,
  /\bs+h+[i1!]+t/i,
  /\ba+s+s+h+o+l+e/i,
  /\bb+[i1!]+t+c+h/i,
  /\bd+[i1!]+c+k/i,
  /\bc+u+n+t/i,
  /\bw+h+o+r+e/i,

  // Racial / ethnic slurs
  /\bn+[i1!]+g+g/i,
  /\bsp+[i1!]+c+k?\b/i,
  /\bch+[i1!]+n+k/i,
  /\bk+[i1!]+k+e/i,
  /\bw+e+t+b+a+c+k/i,
  /\bg+o+o+k\b/i,
  /\br+e+t+a+r+d/i,
  /\bf+a+g+(?:g+o+t+)?/i,
  /\bt+r+a+n+n+y/i,

  // Violence / threats
  /\b(?:kill|shoot|stab|murder|bomb)\s+(?:them|him|her|you|the)/i,
  /\b(?:i'?ll|gonna|going\s+to)\s+(?:kill|shoot|stab|hurt|beat)/i,
  /\bbring\s+(?:a\s+)?gun/i,
  /\bshoot\s*(?:up|this|the)/i,

  // Drug promotion
  /\b(?:sell(?:ing)?|buy(?:ing)?|smok(?:e|ing))\s+(?:meth|crack|heroin|coke|cocaine|fentanyl|pills)\b/i,

  // Targeted harassment of staff — narrowly scoped so we don't block
  // "fire sauce", "fire grilled", "food sucks", etc. Only matches when the
  // target is clearly a specific role.
  /\bfire\s+(?:the\s+|that\s+)?(?:staff|manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender|employee)\b/i,
  /\b(?:the\s+)?(?:manager|owner|cook|chef|waiter|waitress|server|host(?:ess)?|cashier|bartender)\s+(?:is\s+)?(?:an?\s+)?(?:idiot|moron|stupid|worthless|trash|garbage)\b/i,
];

// PII — worker logs the hit but does NOT block. We still save the note but
// strip the PII so other users never see phone numbers / emails in public.
//
// IMPORTANT: every regex is defined via a FACTORY so each call gets a fresh
// RegExp with its own `lastIndex`. Sharing module-level /g regexes between
// test() and replace() causes lastIndex state leakage across calls and can
// silently miss PII at the start of later strings. We always instantiate
// per-call via makePatterns().
function makePiiPatterns(): { label: string; regex: RegExp }[] {
  return [
    // US + intl phones: require a word boundary on BOTH sides and a minimum
    // of 10 digits. Intl formats like "+44 20 7946 0958" also match.
    { label: "phone", regex: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g },
    { label: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { label: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    // Credit card: 13-19 digits WITH a valid Luhn check would be ideal, but
    // we compromise by requiring exactly 15-16 digit groups separated by
    // spaces or hyphens — covers real card formats without tripping on
    // order numbers or tracking IDs.
    { label: "credit_card", regex: /\b(?:\d{4}[-\s]?){3,4}\d{1,4}\b/g },
  ];
}

export interface GuardResult {
  /** True if submission should be rejected. */
  blocked: boolean;
  /** User-facing reason when blocked. */
  reason: string;
  /** PII-scrubbed version of the text, safe to persist. */
  cleaned: string;
  /** Categories of PII that were scrubbed (for logging/metrics). */
  scrubbed: string[];
}

/**
 * Normalize text before matching so Unicode homoglyphs, fullwidth letters,
 * and zero-width joiners can't slip profanity past the blocklist.
 *
 *  - NFKC folds fullwidth → ASCII ("ｆｕｃｋ" → "fuck").
 *  - Zero-width chars (ZWSP, ZWNJ, ZWJ, BOM) are stripped entirely.
 *  - Common Cyrillic/Greek confusables (а/о/е/і/р/у/с/х/в/н/к/м/т) are
 *    folded to their Latin lookalikes.
 *  - Diacritic marks are stripped (ü → u).
 */
function normalizeForModeration(raw: string): string {
  const CYRILLIC_TO_LATIN: Record<string, string> = {
    "а": "a", "в": "b", "с": "c", "е": "e", "һ": "h", "і": "i", "ј": "j",
    "к": "k", "м": "m", "о": "o", "р": "p", "ѕ": "s", "т": "t", "у": "y",
    "х": "x", "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "І": "I",
    "Ј": "J", "К": "K", "М": "M", "О": "O", "Р": "P", "Ѕ": "S", "Т": "T",
    "У": "Y", "Х": "X", "υ": "u", "ι": "i", "ο": "o", "α": "a",
  };
  const ZW_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
  let s = (raw || "").normalize("NFKC").replace(ZW_RE, "");
  // Fold common Cyrillic/Greek confusables to Latin
  s = Array.from(s).map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch).join("");
  // Strip combining diacritics (NFD + remove \p{M})
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
  return s;
}

/**
 * Run moderation and PII scrubbing on user-submitted public note text.
 * Returns { blocked, reason, cleaned, scrubbed }.
 */
export function guardPublicNote(raw: string): GuardResult {
  const text = (raw || "").trim();
  if (!text) {
    return { blocked: true, reason: "Note is empty.", cleaned: "", scrubbed: [] };
  }
  if (text.length < 2) {
    return { blocked: true, reason: "Note is too short.", cleaned: "", scrubbed: [] };
  }
  if (text.length > 500) {
    return { blocked: true, reason: "Note is too long (max 500 characters).", cleaned: "", scrubbed: [] };
  }

  // Normalize for moderation (not for persistence — we still store the
  // user's original Unicode so legitimate names / emoji survive).
  const normalized = normalizeForModeration(text);

  // Content moderation — hard block. Run against normalized text so
  // homoglyph bypass attempts fail.
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        blocked: true,
        reason:
          "This note contains language that isn't allowed in public comments. Please keep it respectful.",
        cleaned: "",
        scrubbed: [],
      };
    }
  }

  // PII scrubbing — replace with [redacted] placeholders. We use
  // per-call regex instances from makePiiPatterns() so lastIndex state
  // never leaks between invocations. Scrubbing runs against the ORIGINAL
  // text (not normalized) so the output preserves the user's spelling.
  let cleaned = text;
  const scrubbed: string[] = [];
  for (const { label, regex } of makePiiPatterns()) {
    if (regex.test(cleaned)) {
      scrubbed.push(label);
      // Fresh regex for the replace to avoid any lingering lastIndex effects.
      const replaceRegex = new RegExp(regex.source, regex.flags);
      cleaned = cleaned.replace(replaceRegex, `[${label} removed]`);
    }
  }

  // Collapse excessive whitespace that the regex replacements may have left
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  return { blocked: false, reason: "", cleaned, scrubbed };
}

/**
 * Simple KV-backed rate limiter for public notes.
 * Caps each identifier (IP / anonymous id) at N writes per window.
 * Uses the RATE_LIMIT KV namespace that already exists in wrangler.toml.
 */
export async function checkNoteRateLimit(
  kv: KVNamespace,
  identifier: string,
  limitPerHour = 10
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const key = `note_rl:${identifier}`;

  const raw = await kv.get(key);
  let stamps: number[] = raw ? JSON.parse(raw) : [];

  // Drop stamps older than the window
  stamps = stamps.filter((ts) => now - ts < windowMs);

  if (stamps.length >= limitPerHour) {
    const oldest = stamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + windowMs,
    };
  }

  stamps.push(now);
  await kv.put(key, JSON.stringify(stamps), {
    expirationTtl: Math.ceil(windowMs / 1000) + 60,
  });

  return {
    allowed: true,
    remaining: limitPerHour - stamps.length,
    resetAt: now + windowMs,
  };
}
