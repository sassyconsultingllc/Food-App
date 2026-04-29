/**
 * Development Logger
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Only logs in development mode to reduce noise in production.
 *
 * Note: __DEV__ is a React Native compile-time global. If this module
 * ever gets imported by the worker / Node server (where __DEV__ doesn't
 * exist), accessing it throws ReferenceError at module load. Guard the
 * lookup so the logger silently falls back to "production-quiet" mode
 * outside RN.
 */

declare const __DEV__: boolean | undefined;

const isDev: boolean =
  typeof __DEV__ !== "undefined"
    ? !!__DEV__
    // Node fallback — workers don't expose process either, the typeof
    // chain handles all three runtimes (RN, Node, Cloudflare Workers).
    : typeof process !== "undefined" && process?.env?.NODE_ENV !== "production";

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },
  debug: (...args: any[]) => {
    if (isDev) console.debug(...args);
  },
};
