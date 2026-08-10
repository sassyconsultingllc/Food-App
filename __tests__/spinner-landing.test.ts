// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Spinner landing invariant.
 *
 * Regression for: "the one it lands on is not the one highlighted for
 * viewing on the restaurant detail screen."
 *
 * The wheel is a reel of the restaurant list repeated LAPS times. It picks
 * winnerIndex, then animates scrollY to an offset that should park that
 * restaurant under the centre pointer. The invariant is:
 *
 *     slotUnderPointer(finalScroll) === winnerIndex
 *
 * That holds only while the reel is built from the SAME list the offset was
 * computed against. The bug was that the reel re-derived from a live prop,
 * so a mid-spin list change (background scrape, filter recompute) moved the
 * items under a scrollY already committed to the old target — and when the
 * list LENGTH changed, (LAPS-2)*N shifted too, so the landing slot no longer
 * mapped back to the winner at all. The component now freezes the list for
 * the duration of the spin; these tests pin the math that freeze protects.
 */
import { describe, it, expect } from "vitest";

// Mirrors components/spinner-wheel.tsx.
const LAPS = 8;
const SLOT_HEIGHT = 72;
const VISIBLE_SLOTS = 5;
const centerOffset = Math.floor(VISIBLE_SLOTS / 2) * SLOT_HEIGHT;

/** The offset the wheel animates to, given a list size and a winner. */
function finalScrollFor(listLength: number, winnerIndex: number): number {
  return (LAPS - 2) * listLength * SLOT_HEIGHT + winnerIndex * SLOT_HEIGHT - centerOffset;
}

/**
 * Which restaurant index sits under the pointer at a given scroll offset,
 * for a reel built from a list of `listLength`. Slot j renders at
 * `j*SLOT_HEIGHT - scrollY`; the pointer window starts at `centerOffset`.
 */
function restaurantUnderPointer(scrollY: number, listLength: number): number {
  const reelIndex = (scrollY + centerOffset) / SLOT_HEIGHT;
  return ((reelIndex % listLength) + listLength) % listLength;
}

describe("spinner lands on the restaurant it reports", () => {
  it("parks the winner under the pointer for every index in the list", () => {
    for (const listLength of [1, 2, 3, 7, 12, 40, 137]) {
      for (let winnerIndex = 0; winnerIndex < listLength; winnerIndex++) {
        const landed = restaurantUnderPointer(
          finalScrollFor(listLength, winnerIndex),
          listLength
        );
        expect(landed).toBe(winnerIndex);
      }
    }
  });

  it("lands on a whole slot boundary — never between two restaurants", () => {
    for (const listLength of [3, 9, 25]) {
      for (let winnerIndex = 0; winnerIndex < listLength; winnerIndex++) {
        const scroll = finalScrollFor(listLength, winnerIndex);
        expect((scroll + centerOffset) % SLOT_HEIGHT).toBe(0);
      }
    }
  });

  it("scrolls forward far enough to read as a spin, not a nudge", () => {
    // Landing must always be well past the starting position (scrollY resets
    // to 0 each spin), otherwise the wheel barely moves for low indices.
    for (const listLength of [2, 8, 30]) {
      for (let winnerIndex = 0; winnerIndex < listLength; winnerIndex++) {
        expect(finalScrollFor(listLength, winnerIndex)).toBeGreaterThan(
          listLength * SLOT_HEIGHT
        );
      }
    }
  });

  it("DEMONSTRATES the bug: a mid-spin list change breaks the mapping", () => {
    // Offset computed against a 10-item list...
    const scroll = finalScrollFor(10, 7);
    // ...but the reel re-populated from a 9-item list mid-animation.
    const landedAfterChange = restaurantUnderPointer(scroll, 9);
    // The pointer no longer sits on index 7 — this is exactly the reported
    // symptom, and why the list must stay frozen for the whole spin.
    expect(landedAfterChange).not.toBe(7);
  });
});
