import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Admin procedure — requires a valid API key in the x-admin-key header.
 * Used for indexing, metrics push, and queue management.
 */
export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access requires a valid x-admin-key header",
      });
    }

    return next({ ctx });
  }),
);
