// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
import { describe, expect, it } from "vitest";

import { requestCountry } from "../worker/request-country";

const withCf = (cf: unknown) => Object.assign(new Request("https://example.com"), { cf }) as Request;

describe("requestCountry", () => {
  it("returns the Cloudflare country for a real request", () => {
    expect(requestCountry(withCf({ country: "DE" }))).toBe("DE");
  });

  it("ignores unknown (XX), Tor (T1), malformed and missing values", () => {
    expect(requestCountry(withCf({ country: "XX" }))).toBeUndefined();
    expect(requestCountry(withCf({ country: "T1" }))).toBeUndefined();
    expect(requestCountry(withCf({ country: "de" }))).toBeUndefined();
    expect(requestCountry(withCf(undefined))).toBeUndefined();
    expect(requestCountry(undefined)).toBeUndefined();
  });
});
