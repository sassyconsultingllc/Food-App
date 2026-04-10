import React from "react";
import { afterEach, vi } from "vitest";

// Log uncaught errors for easier debugging of transform issues
if (typeof process !== "undefined") {
  process.on("uncaughtException", (err) => {
    console.error("[vitest] uncaughtException", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[vitest] unhandledRejection", reason);
  });
}
let cleanup: (() => void) | undefined;

// Router mock exposed for assertions in component tests
const routerPushMock = vi.fn();
(globalThis as any).routerPushMock = routerPushMock;

// Mock React Native to avoid Flow syntax in node during tests
vi.mock("react-native", () => {
  const RNWeb = require("react-native-web");
  return RNWeb;
});

// Avoid pulling in React Native Testing Library (and its RN dependency) unless a test sets it.
cleanup = () => {};

afterEach(() => {
  cleanup?.();
  vi.clearAllMocks();
});

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: routerPushMock }),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Slot: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: {
    Light: "Light",
    Medium: "Medium",
    Heavy: "Heavy",
  },
  NotificationFeedbackType: {
    Success: "Success",
    Warning: "Warning",
    Error: "Error",
  },
}));

vi.mock("expo-image", () => {
  const MockImage = (props: any) => <>{props.children}</>;
  return { Image: MockImage };
});

vi.mock("react-native-reanimated", () => {
  const Reanimated = {
    default: {},
    addWhitelistedNativeProps: () => {},
    useSharedValue: (value: any) => ({ value }),
    useAnimatedStyle: (updater: any) => updater(),
    withTiming: (value: any) => value,
    Easing: { linear: (v: any) => v },
    runOnUI: (fn: any) => fn,
    measure: () => ({}),
  };
  return Reanimated;
});
