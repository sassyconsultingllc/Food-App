/**
 * Environment Variable Validator
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Ensures required environment variables are present at startup
 */

// Client-side vars must have EXPO_PUBLIC_ prefix to be bundled by Metro
const requiredEnvVars = [
  'EXPO_PUBLIC_GOOGLE_VISION_API_KEY',
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
