/**
 * Environment Variable Validator
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Ensures required environment variables are present at startup
 */

// Client-side vars must have EXPO_PUBLIC_ prefix to be bundled by Metro.
// Only truly-public config belongs here — NEVER put a third-party API key
// on this list. All third-party API calls now go through the worker
// proxy (e.g. /api/vision/classify) so the real keys stay on the server.
const requiredEnvVars = [
  'EXPO_PUBLIC_API_BASE_URL',
] as const;

export function validateEnvironment() {
  const missing: string[] = [];

  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });

  if (missing.length > 0) {
    const errorMessage =
      `Missing required environment variables:\n${missing.join('\n')}\n\n` +
      'Please check your .env file and ensure all required variables are set.';

    console.error('[Env]', errorMessage);
    throw new Error(errorMessage);
  }

  if (__DEV__) {
    console.log('[Env] ✓ Environment validation passed');
  }
}
