import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('frontend environment', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the local API when VITE_API_URL is not configured', async () => {
    vi.stubEnv('VITE_API_URL', '');

    const { env } = await import('./env');

    expect(env.apiUrl).toBe('http://localhost:3000/api');
  });

  it('accepts HTTPS and removes trailing slashes', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.hss-finance.example/api///');

    const { env } = await import('./env');

    expect(env.apiUrl).toBe('https://api.hss-finance.example/api');
  });

  it('rejects plaintext HTTP outside local development', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.hss-finance.example/api');

    await expect(import('./env')).rejects.toThrow(/HTTP is allowed only for local development/);
  });

  it('rejects URLs containing credentials, query, or fragment', async () => {
    vi.stubEnv('VITE_API_URL', 'https://user:password@example.com/api?debug=true#section');

    await expect(import('./env')).rejects.toThrow(/without credentials, query, or fragment/);
  });
});
