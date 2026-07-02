import { describe, it, expect } from "vitest";
import {
  generateLicenseKey,
  normalizeKey,
  normalizeEmail,
  sha256Hex,
  timingSafeEqualHex,
  verifyStripeSignature,
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

describe("verifyStripeSignature", () => {
  const SECRET = "whsec_test_secret";

  async function sign(payload: string, timestamp: number): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${payload}`)
    );
    return Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  it("accepts a correctly signed payload", async () => {
    const payload = '{"type":"checkout.session.completed"}';
    const now = 1_700_000_000;
    const sig = await sign(payload, now);
    expect(
      await verifyStripeSignature(payload, `t=${now},v1=${sig}`, SECRET, now)
    ).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const now = 1_700_000_000;
    const sig = await sign('{"a":1}', now);
    expect(await verifyStripeSignature('{"a":2}', `t=${now},v1=${sig}`, SECRET, now)).toBe(false);
  });

  it("rejects a wrong secret", async () => {
    const payload = '{"a":1}';
    const now = 1_700_000_000;
    const sig = await sign(payload, now);
    expect(
      await verifyStripeSignature(payload, `t=${now},v1=${sig}`, "whsec_other", now)
    ).toBe(false);
  });

  it("rejects stale timestamps outside the replay window", async () => {
    const payload = '{"a":1}';
    const signedAt = 1_700_000_000;
    const sig = await sign(payload, signedAt);
    expect(
      await verifyStripeSignature(payload, `t=${signedAt},v1=${sig}`, SECRET, signedAt + 301)
    ).toBe(false);
    expect(
      await verifyStripeSignature(payload, `t=${signedAt},v1=${sig}`, SECRET, signedAt + 299)
    ).toBe(true);
  });

  it("rejects malformed signature headers", async () => {
    expect(await verifyStripeSignature("{}", "garbage", SECRET)).toBe(false);
    expect(await verifyStripeSignature("{}", "t=123", SECRET)).toBe(false);
    expect(await verifyStripeSignature("{}", "v1=abc", SECRET)).toBe(false);
  });
});
