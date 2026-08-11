// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Post-update reset — "fresh install" semantics on every Play Store update.
 * © 2026 Sassy Consulting - A Veteran Owned Company
 *
 * Runs once per installed build, before any provider reads storage. When the
 * native build number changes (Play Store update, sideload, downgrade), every
 * regenerable client-side cache is dropped so the new binary never renders
 * data written by the old one — the failure mode we hit when cached
 * restaurant rows predated a new field and silently drove the wrong result.
 *
 * WHAT THIS DELIBERATELY DOES NOT WIPE
 * -----------------------------------
 * A literal wipe would be actively harmful, in two ways that are easy to miss:
 *
 *   1. The license (SecureStore `foodie_finder_license_v1`). Clearing it logs
 *      every paying Pro customer out on every update. They'd have to re-enter
 *      a key each time.
 *
 *   2. The device id (`foodie_finder_device_id*`). This is what the license
 *      server counts against the 3-device cap. Regenerating it per update
 *      burns a device slot every time — after three updates a legitimate
 *      customer is locked out with "already active on 3 devices" and CANNOT
 *      self-recover, because the old slots belong to device ids that no
 *      longer exist on any hardware. This one turns an update into a support
 *      ticket.
 *
 * SecureStore is therefore never touched here. Within AsyncStorage we sweep
 * everything EXCEPT the allowlist below, so caches added later are cleared
 * automatically. If you add a key holding user-authored content or identity,
 * add it to PRESERVED_KEYS or an update will eat it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

/** Stamp of the build that last ran. Preserved (it IS the migration state). */
const LAST_RUN_BUILD_KEY = "foodie_finder_last_run_build";

/**
 * Survives an update. Everything else in AsyncStorage is treated as cache.
 * Keys mirror the `const`s in hooks/* — keep them in sync.
 */
const PRESERVED_KEYS = new Set<string>([
  LAST_RUN_BUILD_KEY,
  // Identity — see note 2 above. Never regenerate these.
  "foodie_finder_device_id",
  // User-authored content and settings.
  "foodie_finder_favorites",
  "foodie_finder_favorites_data",
  "foodie_finder_personal_notes",
  "foodie_finder_preferences",
  "@foodie_finder_preferences",
  "foodie_finder_recently_viewed",
  "foodie_finder_spin_history",
  "foodie_finder_sound_settings",
  "foodie_finder_theme",
  "theme_mode",
]);

/**
 * Identity of the currently installed binary. `nativeBuildVersion` is the
 * Android versionCode / iOS CFBundleVersion, so consecutive releases that
 * share a versionName (1.0.4 shipped as vc21 and again as vc24) are still
 * distinguishable. Falls back to the JS-side version when the native value
 * is unavailable (Expo Go / web).
 */
export function currentBuildId(): string {
  const version = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "0.0.0";
  const build = Constants.nativeBuildVersion ?? "dev";
  return `${version}+${build}`;
}

export interface UpdateMigrationResult {
  /** True when this run detected a build change and cleared caches. */
  migrated: boolean;
  /** Build that last ran; null on a genuine first install. */
  previousBuild: string | null;
  currentBuild: string;
  /** Number of AsyncStorage keys dropped. */
  clearedKeys: number;
}

/**
 * Clear caches if the installed build changed since the last run.
 *
 * Safe to call on every launch — it is a no-op when the build is unchanged.
 * Never throws: a migration failure must not block app start, since that
 * would brick the app for anyone whose storage is in a bad state.
 */
export async function runUpdateMigrationIfNeeded(): Promise<UpdateMigrationResult> {
  const currentBuild = currentBuildId();
  const result: UpdateMigrationResult = {
    migrated: false,
    previousBuild: null,
    currentBuild,
    clearedKeys: 0,
  };

  try {
    const previousBuild = await AsyncStorage.getItem(LAST_RUN_BUILD_KEY);
    result.previousBuild = previousBuild;

    if (previousBuild === currentBuild) return result;

    // Changed build (or first run). On a genuine first install there is
    // nothing to clear, but the sweep is harmless and still stamps the build.
    const allKeys = await AsyncStorage.getAllKeys();
    const doomed = allKeys.filter((k) => !PRESERVED_KEYS.has(k));

    if (doomed.length > 0) {
      await AsyncStorage.multiRemove(doomed);
    }

    await AsyncStorage.setItem(LAST_RUN_BUILD_KEY, currentBuild);

    result.migrated = previousBuild !== null;
    result.clearedKeys = doomed.length;

    if (result.migrated) {
      // No key names logged — some carry user content.
      console.log(
        `[update] build ${previousBuild} -> ${currentBuild}; cleared ${doomed.length} cached entries`,
      );
    }
    return result;
  } catch (err) {
    console.warn("[update] migration skipped", err);
    return result;
  }
}
