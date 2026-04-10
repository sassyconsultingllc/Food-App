/**
 * Server environment config.
 *
 * SECURITY: API keys must come from environment variables, never from
 * literal defaults. Any key that was hardcoded in an earlier revision of
 * this file should be rotated immediately — git history still contains
 * the old values.
 */
export const ENV = {
  appId: process.env.VITE_APP_ID ?? "foodie-finder",
  cookieSecret: process.env.JWT_SECRET ?? "",
  EXPO_PUBLIC_API_BASE_URL:
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    "https://foodie-finder-api-preview.sassyconsultingllc.workers.dev",
  isProduction: process.env.NODE_ENV === "production",

  // Restaurant Data Sources — ALL from env
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ?? "",
  FOURSQUARE_API_KEY: process.env.FOURSQUARE_API_KEY ?? "",
  HERE_API_KEY: process.env.HERE_API_KEY ?? "",

  // API Keys (camelCase aliases for modules that read them that way)
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
  foursquareApiKey: process.env.FOURSQUARE_API_KEY ?? "",
  hereApiKey: process.env.HERE_API_KEY ?? "",

  // Infrastructure
  redisUrl: process.env.REDIS_URL ?? "",
  pushgatewayUrl: process.env.PUSHGATEWAY_URL ?? "",
  adminPushKey: process.env.ADMIN_PUSH_KEY ?? "",
  chromaServerUrl: process.env.CHROMA_SERVER_URL ?? "http://localhost:8000",

  // Authentication
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",

  // AI Services
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  clipApiUrl: process.env.CLIP_API_URL ?? "",

  // Forge API
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

/**
 * Runtime sanity check — logs a warning if any required key is missing.
 * Call this from your server bootstrap so missing keys surface loudly
 * instead of failing silently inside scraper calls.
 */
export function validateEnvOrWarn(): void {
  const missing: string[] = [];
  if (!ENV.GOOGLE_PLACES_API_KEY) missing.push("GOOGLE_PLACES_API_KEY");
  if (!ENV.cookieSecret) missing.push("JWT_SECRET");
  if (missing.length > 0) {
    console.warn(
      `[env] Missing required environment variables: ${missing.join(", ")}. ` +
        `Features depending on them will fail silently. Set them in .env or via your hosting provider.`
    );
  }
}
