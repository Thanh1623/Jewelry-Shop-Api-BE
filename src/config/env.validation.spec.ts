import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('passes development config through untouched even when secrets are missing', () => {
    const inputConfig = { NODE_ENV: 'development' };

    const actualResult = validateEnv(inputConfig);

    expect(actualResult).toBe(inputConfig);
  });

  it('throws in production when required secrets are missing', () => {
    const inputConfig = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
    };

    expect(() => validateEnv(inputConfig)).toThrow(
      /Missing required environment variables in production: JWT_SECRET, WEBHOOK_SECRET, CORS_ORIGIN/,
    );
  });

  it('passes production config through when all required secrets are present', () => {
    const inputConfig = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      JWT_SECRET: 'secret',
      WEBHOOK_SECRET: 'secret',
      CORS_ORIGIN: 'https://shop.example.com',
    };

    const actualResult = validateEnv(inputConfig);

    expect(actualResult).toBe(inputConfig);
  });
});
