/**
 * App Sound Effects Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Plays sound effects for key user interactions.
 * Respects the user's sound-enabled preference from useSoundSettings.
 */

import { createAudioPlayer, useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef } from "react";

// Static requires so Metro bundles them
const SOUNDS = {
  wheelSpin: require("@/assets/sounds/wheel-spinning.wav"),
  appOpen: require("@/assets/sounds/app-open.wav"),
  postNote: require("@/assets/sounds/post-note.wav"),
  deleteNote: require("@/assets/sounds/delete-note.wav"),
  favorite: require("@/assets/sounds/favorite.wav"),
} as const;

type SoundName = keyof typeof SOUNDS;

/**
 * Returns a `playSound` function. Pass `soundEnabled` from your
 * sound-settings hook so it respects user prefs.
 */
export function useAppSounds(soundEnabled: boolean) {
  // Pre-create a player for each sound — expo-audio manages lifecycle
  const playersRef = useRef<Map<SoundName, ReturnType<typeof useAudioPlayer>>>(new Map());

  const playSound = useCallback(
    (name: SoundName) => {
      if (!soundEnabled) return;

      try {
        // createAudioPlayer is imported statically so the very first sound
        // doesn't pay the dynamic-import overhead (~50-150 ms cold). Lazy
        // PLAYER instantiation is preserved — we still only allocate a
        // player when a sound is actually requested.
        let player = playersRef.current.get(name);
        if (!player) {
          player = createAudioPlayer(SOUNDS[name]);
          player.volume = 0.8;
          playersRef.current.set(name, player);
        }
        player.seekTo(0);
        player.play();
      } catch (e) {
        // Silently fail — sounds are nice-to-have, not critical
        console.warn(`[Sound] Failed to play ${name}:`, e);
      }
    },
    [soundEnabled],
  );

  // Release every audio player on unmount so the native buffers are freed.
  // Without this, each mount of a screen that uses the hook accumulates
  // up to 5 audio buffers that never get GC'd.
  useEffect(() => {
    const map = playersRef.current;
    return () => {
      map.forEach((player) => {
        try {
          (player as any).remove?.();
        } catch {
          // best effort — expo-audio will clean up when the JS ref is GC'd
        }
      });
      map.clear();
    };
  }, []);

  return { playSound };
}
