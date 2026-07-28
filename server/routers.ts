// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-DXND76AOV2ZD
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { restaurantRouter } from "./restaurant-router";

export const appRouter = router({
  system: systemRouter,
  restaurant: restaurantRouter,
});

export type AppRouter = typeof appRouter;
