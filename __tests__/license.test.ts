import { describe, it, expect } from "vitest";
import {
  generateLicenseKey,
  normalizeKey,
  normalizeEmail,
  sha256Hex,
  hmacSha256Hex,
  hashEmail,
  emailMatchesHash,
  timingSafeEqualHex,
  verifyLemonSqueezySignature,
} from "../worker/license";

describe("generateLicenseKey", () => {
  it("matches the FF-XXXXX-XXXXX-XXXXX-XXXXX format with an unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const key = generateLicenseKey();
      expect(key).toMatch(/^FF-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
      // ambiguous glyphs never appear
      expect(key).not.toMatch(/[01OI]/);
    }
  });

  it("does not repeat across a batch", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateLicenseKey()));
    expect(keys.size).toBe(1000);
  });
});

describe("normalization", () => {
  it("uppercases and trims keys", () => {
    expect(normalizeKey("  ff-abcde-fghjk-lmnpq-rstuv ")).toBe("FF-ABCDE-FGHJK-LMNPQ-RSTUV");
  });
  it("lowercases and trims emails", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
  });
});

describe("timingSafeEqualHex", () => {
  it("accepts equal strings and rejects unequal ones", () => {
    expect(timingSafeEqualHex("abc123", "abc123")).toBe(true);
    expect(timingSafeEqualHex("abc123", "abc124")).toBe(false);
    expect(timingSafeEqualHex("abc123", "abc12")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(true);
  });
});

describe("sha256Hex", () => {
  it("matches the NIST test vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("email hashing (anonymity at rest)", () => {
  const PEPPER = "test-pepper";

  it("matches the RFC 4231 HMAC-SHA256 test vector", async () => {
    // Test case 2: key "Jefe", data "what do ya want for nothing?"
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    );
  });

  it("never stores a plaintext email in either scheme", async () => {
    const peppered = await hashEmail(PEPPER, "User@Example.com");
    const fallback = await hashEmail(undefined, "User@Example.com");
    expect(peppered).toMatch(/^hmac1:[0-9a-f]{64}$/);
    expect(fallback).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(peppered).not.toContain("example.com");
    expect(fallback).not.toContain("example.com");
  });

  it("normalizes email case/whitespace before hashing", async () => {
    expect(await hashEmail(PEPPER, "  User@Example.COM ")).toBe(
      await hashEmail(PEPPER, "user@example.com")
    );
  });

  it("verifies against the scheme the row was minted with", async () => {
    const peppered = await hashEmail(PEPPER, "a@b.com");
    const fallback = await hashEmail(undefined, "a@b.com");
    // hmac1 row verifies only with the right pepper
    expect(await emailMatchesHash(PEPPER, "A@B.com", peppered)).toBe(true);
    expect(await emailMatchesHash("other-pepper", "a@b.com", peppered)).toBe(false);
    expect(await emailMatchesHash(undefined, "a@b.com", peppered)).toBe(false);
    // sha256 (pre-pepper) row keeps verifying after the pepper is introduced
    expect(await emailMatchesHash(PEPPER, "a@b.com", fallback)).toBe(true);
    expect(await emailMatchesHash(undefined, "a@b.com", fallback)).toBe(true);
    // wrong email never matches
    expect(await emailMatchesHash(PEPPER, "x@b.com", peppered)).toBe(false);
    expect(await emailMatchesHash(PEPPER, "x@b.com", fallback)).toBe(false);
    // unknown scheme fails closed
    expect(await emailMatchesHash(PEPPER, "a@b.com", "plaintext:a@b.com")).toBe(false);
  });
});

describe("verifyLemonSqueezySignature", () => {
  const SECRET = "ls_test_webhook_secret";

  async function sign(payload: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  it("accepts a correctly signed payload", async () => {
    const payload = '{"meta":{"event_name":"order_created"}}';
    const sig = await sign(payload, SECRET);
    expect(await verifyLemonSqueezySignature(payload, sig, SECRET)).toBe(true);
  });

  it("accepts an uppercase-hex signature (case-insensitive compare)", async () => {
    const payload = '{"a":1}';
    const sig = await sign(payload, SECRET);
    expect(await verifyLemonSqueezySignature(payload, sig.toUpperCase(), SECRET)).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const sig = await sign('{"a":1}', SECRET);
    expect(await verifyLemonSqueezySignature('{"a":2}', sig, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", async () => {
    const payload = '{"a":1}';
    const sig = await sign(payload, SECRET);
    expect(await verifyLemonSqueezySignature(payload, sig, "other-secret")).toBe(false);
  });

  it("rejects a missing signature or secret", async () => {
    expect(await verifyLemonSqueezySignature("{}", "", SECRET)).toBe(false);
    expect(await verifyLemonSqueezySignature("{}", "abc123", "")).toBe(false);
  });
});
