import { timingSafeEqual } from "node:crypto";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  isAdmin: boolean;
};

/**
 * Constant-time string comparison. A naive `===` short-circuits on the
 * first differing byte, which lets an attacker time response latency to
 * brute-force the admin key one byte at a time. crypto.timingSafeEqual
 * requires equal-length buffers, so we pre-check the length and pad to
 * the longer length when they differ — comparing always covers the same
 * number of bytes regardless of input length.
 */
function safeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Still run a comparison to keep timing roughly constant relative to
    // input length. Compare against itself; the result is discarded.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  // Admin access is granted via API key in the x-admin-key header.
  // Express normalizes header names to lowercase, so the literal
  // 'x-admin-key' lookup also matches client-sent 'X-Admin-Key' /
  // 'X-ADMIN-KEY' / etc. — no extra casing variants needed.
  const adminKey = opts.req.headers["x-admin-key"] as string | undefined;
  const isAdmin =
    !!ENV.adminPushKey &&
    !!adminKey &&
    safeStringEqual(adminKey, ENV.adminPushKey);

  return {
    req: opts.req,
    res: opts.res,
    isAdmin,
  };
}
