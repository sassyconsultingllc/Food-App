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
const PII_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "phone", regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { label: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { label: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: "credit_card", regex: /\b(?:\d[-\s]?){13,19}\b/g },
];

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

  // Content moderation — hard block
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        blocked: true,
        reason:
          "This note contains language that isn't allowed in public comments. Please keep it respectful.",
        cleaned: "",
        scrubbed: [],
      };
    }
  }

  // PII scrubbing — replace with [redacted] placeholders
  let cleaned = text;
  const scrubbed: string[] = [];
  for (const { label, regex } of PII_PATTERNS) {
    if (regex.test(cleaned)) {
      scrubbed.push(label);
      cleaned = cleaned.replace(regex, `[${label} removed]`);
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
