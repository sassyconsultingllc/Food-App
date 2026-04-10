import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  isAdmin: boolean;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  // Admin access is granted via API key in the x-admin-key header
  const adminKey = opts.req.headers["x-admin-key"] as string | undefined;
  const isAdmin = !!ENV.adminPushKey && !!adminKey && adminKey === ENV.adminPushKey;

  return {
    req: opts.req,
    res: opts.res,
    isAdmin,
  };
}
