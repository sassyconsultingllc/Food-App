import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// In-memory rate limiter for admin attempts. Counters reset on process
// restart, which is acceptable here — the goal is to slow brute-force of
// the admin key, not provide hard quota tracking. A persistent backend
// would be better but this server already runs in a single-process Node
// context for admin work, and a Map is enough to make a brute-force loud
// in logs and noisy enough that an attacker would notice.
const ADMIN_RATE_WINDOW_MS = 60_000;
const ADMIN_RATE_MAX = 30;
const adminAttemptLog = new Map<string, number[]>();

function adminClientKey(ctx: TrpcContext): string {
  // Trust the first XFF entry only when the proxy is configured to set it
  // (Express won't trust XFF unless `app.set('trust proxy')` is set; we
  // don't, so req.ip reflects the socket peer). Fall back to "anon" so
  // the limiter still groups them together rather than skipping the gate.
  const ip = (ctx.req.ip || ctx.req.socket?.remoteAddress || "anon") as string;
  return ip;
}

function checkAdminRate(client: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const stamps = (adminAttemptLog.get(client) || []).filter(
    (ts) => now - ts < ADMIN_RATE_WINDOW_MS
  );
  if (stamps.length >= ADMIN_RATE_MAX) {
    adminAttemptLog.set(client, stamps);
    return { allowed: false, remaining: 0 };
  }
  stamps.push(now);
  adminAttemptLog.set(client, stamps);
  return { allowed: true, remaining: ADMIN_RATE_MAX - stamps.length };
}

/**
 * Admin procedure — requires a valid API key in the x-admin-key header.
 * Used for indexing, metrics push, and queue management.
 *
 * Rate-limited: 30 attempts per minute per client, both for failed and
 * successful calls. Each invocation is logged with timestamp + client ID
 * + outcome so a brute-force attempt on the admin key shows up in the
 * server log clearly. The key itself is never logged.
 */
export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next, path, type } = opts;
    const client = adminClientKey(ctx);
    const rate = checkAdminRate(client);

    if (!rate.allowed) {
      console.warn(
        `[admin] RATE_LIMIT client=${client} path=${path} type=${type} ts=${new Date().toISOString()}`
      );
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many admin requests. Try again in a minute.",
      });
    }

    if (!ctx.isAdmin) {
      console.warn(
        `[admin] DENY client=${client} path=${path} type=${type} ts=${new Date().toISOString()}`
      );
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access requires a valid x-admin-key header",
      });
    }

    console.info(
      `[admin] ALLOW client=${client} path=${path} type=${type} ts=${new Date().toISOString()} remaining=${rate.remaining}`
    );
    return next({ ctx });
  }),
);
