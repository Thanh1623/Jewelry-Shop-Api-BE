const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'JWT_SECRET',
  'WEBHOOK_SECRET',
  'CORS_ORIGIN',
] as const;

/**
 * Fail fast on boot when running in production without the secrets/config
 * the app needs. Development/test keep the soft defaults already used
 * throughout the codebase (e.g. `configService.get('JWT_SECRET', 'dev-secret')`).
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (config.NODE_ENV !== 'production') {
    return config;
  }

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(', ')}`,
    );
  }

  return config;
}
