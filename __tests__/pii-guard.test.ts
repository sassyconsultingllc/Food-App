// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-PII1GUARDTEST
import { describe, expect, it } from "vitest";
import { checkForPII, checkPublicNote, moderateContent } from "@/utils/pii-guard";

describe("checkForPII", () => {
  it("returns clean for a normal dining tip", () => {
    const result = checkForPII("Get the fish tacos and sit outside.");
    expect(result.hasPII).toBe(false);
    expect(result.detected).toEqual([]);
  });

  it("warns on a phone number without blocking", () => {
    const result = checkForPII("Call the owner at 555-123-4567 for catering.");
    expect(result.hasPII).toBe(true);
    expect(result.detected).toContain("phone number");
  });

  it("warns on an email address", () => {
    const result = checkForPII("Email chef@example.com for the private menu.");
    expect(result.hasPII).toBe(true);
    expect(result.detected).toContain("email address");
  });
});

describe("moderateContent", () => {
  it("blocks slurs and allows ordinary complaints", () => {
    expect(moderateContent("The pasta was overcooked.").blocked).toBe(false);
    expect(moderateContent("what a stupid bitch of a waiter").blocked).toBe(true);
  });
});

describe("checkPublicNote", () => {
  it("blocks moderated content and does not submit-path as clean", () => {
    const result = checkPublicNote("what a stupid bitch of a waiter");
    expect(result.blocked).toBe(true);
    expect(result.blockReason.length).toBeGreaterThan(0);
  });

  it("sets piiWarning for phone/email so the UI can confirm before post", () => {
    const result = checkPublicNote("Text me at 555-123-4567");
    expect(result.blocked).toBe(false);
    expect(result.piiWarning.length).toBeGreaterThan(0);
    expect(result.piiDetected).toContain("phone number");
  });

  it("is clean for a helpful anonymous tip", () => {
    const result = checkPublicNote("Park in the back lot. Ask for the weekday lunch special.");
    expect(result.blocked).toBe(false);
    expect(result.piiWarning).toBe("");
  });
});
