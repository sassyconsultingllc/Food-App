import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { restaurantRouter } from "./restaurant-router";

export const appRouter = router({
  system: systemRouter,
  restaurant: restaurantRouter,
});

export type AppRouter = typeof appRouter;
