/**
 * App Sound Effects Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Plays sound effects for key user interactions.
 * Respects the user's sound-enabled preference from useSoundSettings.
 */

import { useAudioPlayer } from "expo-audio";
import { useCallback, useRef } from "react";

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
    async (name: SoundName) => {
      if (!soundEnabled) return;

      try {
        // Lazy-create players isn't possible with the hook API,
        // so we use the imperative createAudioPlayer instead
        const { createAudioPlayer } = await import("expo-audio");
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

  return { playSound };
}
