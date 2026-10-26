// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Shared preferences store: every screen's useRestaurantStorage() instance
 * must see a location saved on any other screen.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES } from "../types/restaurant";
import {
  getSharedPreferences,
  publishPreferences,
  resetPreferencesStore,
  subscribePreferences,
} from "../utils/preferences-store";

describe("preferences-store", () => {
  beforeEach(() => {
    resetPreferencesStore();
  });

  it("starts empty until the first load publishes", () => {
    expect(getSharedPreferences()).toBeNull();
  });

  it("delivers a zip saved on one screen to every other subscribed screen", () => {
    const seenByHome: string[] = [];
    const seenByBrowse: string[] = [];
    subscribePreferences((p) => seenByHome.push(p.defaultZipCode ?? ""));
    subscribePreferences((p) => seenByBrowse.push(p.defaultZipCode ?? ""));

    publishPreferences({ ...DEFAULT_PREFERENCES, defaultZipCode: "53703" });

    expect(seenByHome).toEqual(["53703"]);
    expect(seenByBrowse).toEqual(["53703"]);
    expect(getSharedPreferences()?.defaultZipCode).toBe("53703");
  });

  it("stops notifying a screen after it unmounts", () => {
    const seen: string[] = [];
    const unsubscribe = subscribePreferences((p) => seen.push(p.defaultZipCode ?? ""));
    unsubscribe();

    publishPreferences({ ...DEFAULT_PREFERENCES, defaultZipCode: "10115" });

    expect(seen).toEqual([]);
  });

  it("lets a later save build on the latest snapshot instead of a stale copy", () => {
    publishPreferences({ ...DEFAULT_PREFERENCES, defaultZipCode: "53703", defaultRadius: 10 });
    // A second screen saving an unrelated field must keep the new zip.
    const prev = getSharedPreferences()!;
    publishPreferences({ ...prev, favorites: ["abc"] });

    expect(getSharedPreferences()).toMatchObject({
      defaultZipCode: "53703",
      defaultRadius: 10,
      favorites: ["abc"],
    });
  });
});
