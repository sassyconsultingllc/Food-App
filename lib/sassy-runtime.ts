/**
 * Sassy Runtime - Communication layer between Expo web app and parent container
 *
 * Simplified flow:
 * 1. initSassyRuntime() called
 * 2. Send 'appDevServerReady' to parent to signal app is ready
 *
 * User will manually login via the app's login page - no automatic cookie injection.
 */

import { Platform } from "react-native";
import type { Metrics } from "react-native-safe-area-context";

// Debug logging with timestamps
const DEBUG = true;
const log = (msg: string) => {
  if (!DEBUG) return;
  const ts = new Date().toISOString();
  console.log(`[SassyRuntime ${ts}] ${msg}`);
};

type MessageType = "appDevServerReady";
type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };
type SafeAreaCallback = (metrics: Metrics) => void;

interface SpacePreviewerMessage {
  type: "SpacePreviewerChannel";
  payload: {
    type: string;
    from: "container" | "content";
    to: "container" | "content";
    payload: Record<string, unknown>;
  };
}

function isInIframe(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isWeb(): boolean {
  return Platform.OS === "web";
}

// Allowed parent origins for postMessage. The Sassy preview platform hosts
// the iframe at one of these; sending to "*" would let any embedder
// snoop the appDevServerReady envelope (and any future payloads we add).
//
// Read once at module load — re-reading process.env per call would force
// Metro to leave it as a runtime lookup and inflate the bundle.
const ALLOWED_PARENT_ORIGINS = (() => {
  const fromEnv = (
    typeof process !== "undefined" && process?.env?.EXPO_PUBLIC_SASSY_PARENT_ORIGINS
  )
    ? process.env.EXPO_PUBLIC_SASSY_PARENT_ORIGINS
    : "";
  const defaults = [
    "https://preview.sassyconsultingllc.com",
    "https://sassyconsultingllc.com",
    "https://www.sassyconsultingllc.com",
  ];
  const extras = fromEnv
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...defaults, ...extras]);
})();

function getValidatedParentOrigin(): string | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  // document.referrer reflects the actual parent origin when in an iframe.
  // We cannot read window.parent.location synchronously due to same-origin
  // policy, so referrer is the closest stable signal.
  try {
    const ref = document.referrer ? new URL(document.referrer).origin : "";
    return ALLOWED_PARENT_ORIGINS.has(ref) ? ref : null;
  } catch {
    return null;
  }
}

function sendToParent(type: MessageType, payload: Record<string, unknown> = {}): void {
  if (!isWeb() || !isInIframe()) return;

  const targetOrigin = getValidatedParentOrigin();
  if (!targetOrigin) {
    log(`Refused to post '${type}' — parent origin not in allowlist`);
    return;
  }

  const message: SpacePreviewerMessage = {
    type: "SpacePreviewerChannel",
    payload: { type, from: "content", to: "container", payload },
  };
  // Pass the validated origin instead of "*" so a malicious parent that
  // navigated this iframe can't intercept the postMessage payload.
  window.parent.postMessage(message, targetOrigin);
  log(`Sent to parent: ${type} (origin=${targetOrigin})`);
}

let initialized = false;
let safeAreaCallback: SafeAreaCallback | null = null;

function isValidInsets(payload: Record<string, unknown>): payload is SafeAreaInsets {
  return (
    typeof payload.top === "number" &&
    typeof payload.bottom === "number" &&
    typeof payload.left === "number" &&
    typeof payload.right === "number"
  );
}

function handleMessage(event: MessageEvent<unknown>): void {
  // Reject messages from any origin not on the parent allowlist. Without
  // this check a same-page injection via window.postMessage from an
  // unrelated iframe could pretend to be the preview container and feed
  // us setSafeAreaInsets payloads (which directly affect layout) or any
  // future container→content message we add.
  if (!ALLOWED_PARENT_ORIGINS.has(event.origin)) return;

  const data = event.data as SpacePreviewerMessage | undefined;
  if (!data || data.type !== "SpacePreviewerChannel") return;

  const { payload } = data;
  if (!payload || payload.to !== "content") return;

  if (payload.type === "setSafeAreaInsets" && isValidInsets(payload.payload) && safeAreaCallback) {
    const insets = payload.payload;
    const frame = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    safeAreaCallback({ insets, frame });
    log(
      `Received safe area insets from parent: top=${insets.top}, bottom=${insets.bottom}, left=${insets.left}, right=${insets.right}`,
    );
  }
}

/**
 * Subscribe to safe area updates from the parent container.
 */
export function subscribeSafeAreaInsets(callback: SafeAreaCallback): () => void {
  safeAreaCallback = callback;
  return () => {
    if (safeAreaCallback === callback) {
      safeAreaCallback = null;
    }
  };
}

/**
 * Initialize Sassy Runtime - just notifies parent that app is ready
 */
export function initSassyRuntime(): void {
  if (!isWeb() || !isInIframe()) return;
  if (initialized) return;
  initialized = true;

  log("initSassyRuntime called");
  window.addEventListener("message", handleMessage);
  sendToParent("appDevServerReady", {});
}

/**
 * Check if running inside preview iframe
 */
export function isRunningInPreviewIframe(): boolean {
  return isWeb() && isInIframe();
}
