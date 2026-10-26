// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Shared stores: every screen's useRestaurantStorage() instance must see a
 * location, favorite or note saved on any other screen.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES, type Restaurant } from "../types/restaurant";
import {
  createSharedStore,
  favoritesStore,
  personalNotesStore,
  preferencesStore,
} from "../utils/shared-store";

describe("createSharedStore", () => {
  it("starts empty until the first load publishes", () => {
    expect(createSharedStore<number>().get()).toBeNull();
  });

  it("delivers a value published on one screen to every other subscribed screen", () => {
    const store = createSharedStore<string>();
    const seenByHome: string[] = [];
    const seenByBrowse: string[] = [];
    store.subscribe((v) => seenByHome.push(v));
    store.subscribe((v) => seenByBrowse.push(v));

    store.publish("53703");

    expect(seenByHome).toEqual(["53703"]);
    expect(seenByBrowse).toEqual(["53703"]);
    expect(store.get()).toBe("53703");
  });

  it("stops notifying a screen after it unmounts", () => {
    const store = createSharedStore<string>();
    const seen: string[] = [];
    const unsubscribe = store.subscribe((v) => seen.push(v));
    unsubscribe();

    store.publish("10115");

    expect(seen).toEqual([]);
  });
});

describe("app stores", () => {
  beforeEach(() => {
    preferencesStore.reset();
    favoritesStore.reset();
    personalNotesStore.reset();
  });

  it("lets a later preferences save build on the latest snapshot instead of a stale copy", () => {
    preferencesStore.publish({ ...DEFAULT_PREFERENCES, defaultZipCode: "53703", defaultRadius: 10 });
    // A second screen saving an unrelated field must keep the new zip.
    preferencesStore.publish({ ...preferencesStore.get()!, favorites: ["abc"] });

    expect(preferencesStore.get()).toMatchObject({
      defaultZipCode: "53703",
      defaultRadius: 10,
      favorites: ["abc"],
    });
  });

  it("shows a favorite added on Browse in the Favorites tab", () => {
    let favoritesTab: Record<string, Restaurant> = {};
    favoritesStore.subscribe((v) => {
      favoritesTab = v;
    });
    favoritesStore.publish({});

    const restaurant = { id: "r1", name: "Graze" } as Restaurant;
    favoritesStore.publish({ ...favoritesStore.get()!, [restaurant.id]: restaurant });

    expect(Object.keys(favoritesTab)).toEqual(["r1"]);
  });

  it("keeps notes written on the detail page when another screen saves", () => {
    personalNotesStore.publish({});
    personalNotesStore.publish({ ...personalNotesStore.get()!, r1: "ask for the booth" });
    // Another screen's later edit builds on the shared copy, not its own.
    personalNotesStore.publish({ ...personalNotesStore.get()!, r2: "cash only" });

    expect(personalNotesStore.get()).toEqual({ r1: "ask for the booth", r2: "cash only" });
  });
});
