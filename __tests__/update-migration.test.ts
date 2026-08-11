// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Post-update reset.
 *
 * The dangerous failure here is not "a cache survived" — it's wiping
 * something that must persist. Two keys in particular:
 *   - the license (SecureStore; this module must not touch SecureStore at all)
 *   - the device id, which the server counts against the 3-device cap. Losing
 *     it per update burns a slot each time and locks a paying customer out
 *     after three updates with no way to self-recover.
 * These tests exist mainly to pin that.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { runUpdateMigrationIfNeeded, currentBuildId } from "../lib/update-migration";

const LAST_RUN = "foodie_finder_last_run_build";

async function seed(entries: Record<string, string>) {
  for (const [k, v] of Object.entries(entries)) await AsyncStorage.setItem(k, v);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  vi.restoreAllMocks();
});

describe("runUpdateMigrationIfNeeded", () => {
  it("treats a first install as non-migrating but stamps the build", async () => {
    const res = await runUpdateMigrationIfNeeded();
    expect(res.migrated).toBe(false);
    expect(res.previousBuild).toBeNull();
    expect(await AsyncStorage.getItem(LAST_RUN)).toBe(currentBuildId());
  });

  it("is a no-op when the build is unchanged", async () => {
    await seed({
      [LAST_RUN]: currentBuildId(),
      foodie_finder_cached_restaurants: '[{"id":"x"}]',
    });
    const res = await runUpdateMigrationIfNeeded();
    expect(res.migrated).toBe(false);
    expect(res.clearedKeys).toBe(0);
    // Cache survives an ordinary launch — we only reset across builds.
    expect(await AsyncStorage.getItem("foodie_finder_cached_restaurants")).not.toBeNull();
  });

  it("clears caches when the build changed", async () => {
    await seed({
      [LAST_RUN]: "1.0.4+21",
      foodie_finder_cached_restaurants: '[{"id":"x"}]',
      foodie_finder_cache_timestamp: "123",
      some_future_cache_added_later: "junk",
    });
    const res = await runUpdateMigrationIfNeeded();
    expect(res.migrated).toBe(true);
    expect(res.previousBuild).toBe("1.0.4+21");
    expect(await AsyncStorage.getItem("foodie_finder_cached_restaurants")).toBeNull();
    expect(await AsyncStorage.getItem("foodie_finder_cache_timestamp")).toBeNull();
    // Unknown keys are treated as cache, so new caches self-clear.
    expect(await AsyncStorage.getItem("some_future_cache_added_later")).toBeNull();
  });

  it("PRESERVES the device id across an update (3-device-cap lockout)", async () => {
    await seed({ [LAST_RUN]: "1.0.4+21", foodie_finder_device_id: "dev_abc123" });
    await runUpdateMigrationIfNeeded();
    expect(await AsyncStorage.getItem("foodie_finder_device_id")).toBe("dev_abc123");
  });

  it("PRESERVES user content and settings across an update", async () => {
    await seed({
      [LAST_RUN]: "1.0.4+21",
      foodie_finder_favorites: '["a"]',
      foodie_finder_favorites_data: '{"a":{"id":"a"}}',
      foodie_finder_personal_notes: '{"a":"great tacos"}',
      foodie_finder_preferences: '{"defaultRadius":10}',
      "@foodie_finder_preferences": '{"defaultRadius":10}',
      foodie_finder_spin_history: '[{"id":"a"}]',
      foodie_finder_recently_viewed: '["a"]',
      foodie_finder_sound_settings: '{"soundEnabled":true}',
    });
    await runUpdateMigrationIfNeeded();
    expect(await AsyncStorage.getItem("foodie_finder_favorites_data")).not.toBeNull();
    expect(await AsyncStorage.getItem("foodie_finder_personal_notes")).toBe(
      '{"a":"great tacos"}',
    );
    expect(await AsyncStorage.getItem("foodie_finder_preferences")).not.toBeNull();
    expect(await AsyncStorage.getItem("@foodie_finder_preferences")).not.toBeNull();
    expect(await AsyncStorage.getItem("foodie_finder_spin_history")).not.toBeNull();
    expect(await AsyncStorage.getItem("foodie_finder_recently_viewed")).not.toBeNull();
    expect(await AsyncStorage.getItem("foodie_finder_sound_settings")).not.toBeNull();
  });

  it("re-stamps so the reset runs once per build, not every launch", async () => {
    await seed({ [LAST_RUN]: "1.0.4+21", cache_a: "1" });
    const first = await runUpdateMigrationIfNeeded();
    expect(first.migrated).toBe(true);

    await AsyncStorage.setItem("cache_b", "2");
    const second = await runUpdateMigrationIfNeeded();
    expect(second.migrated).toBe(false);
    expect(await AsyncStorage.getItem("cache_b")).toBe("2");
  });

  it("also resets on a downgrade, not just a forward update", async () => {
    await seed({ [LAST_RUN]: "9.9.9+999", cache_a: "1" });
    const res = await runUpdateMigrationIfNeeded();
    expect(res.migrated).toBe(true);
    expect(await AsyncStorage.getItem("cache_a")).toBeNull();
  });

  it("never throws — a broken storage read must not block app start", async () => {
    vi.spyOn(AsyncStorage, "getAllKeys").mockRejectedValueOnce(new Error("boom"));
    await seed({ [LAST_RUN]: "1.0.4+21" });
    await expect(runUpdateMigrationIfNeeded()).resolves.toMatchObject({ migrated: false });
  });
});
