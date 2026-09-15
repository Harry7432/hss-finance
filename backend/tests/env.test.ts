import { parseJwtSecret } from '../src/config/jwt.js';
import { parseFrontendOrigin, parseNodeEnvironment } from '../src/config/env.js';
import { createSessionCookieOptions } from '../src/config/session.js';

describe('JWT_SECRET configuration', () => {
  it('rejects a missing secret', () => {
    expect(() => parseJwtSecret(undefined)).toThrow('JWT_SECRET is required.');
  });

  it('rejects an invalid Base64 secret', () => {
    expect(() => parseJwtSecret('not-valid-base64!')).toThrow('JWT_SECRET must be valid Base64.');
  });

  it('rejects a secret shorter than 32 decoded bytes', () => {
    const shortSecret = Buffer.alloc(31, 1).toString('base64');

    expect(() => parseJwtSecret(shortSecret)).toThrow(
      'JWT_SECRET must decode to at least 32 bytes.',
    );
  });
});

describe('frontend origin configuration', () => {
  it('accepts a canonical HTTP or HTTPS origin', () => {
    expect(parseFrontendOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(parseFrontendOrigin('https://app.hss-finance.example')).toBe(
      'https://app.hss-finance.example',
    );
  });

  it('requires HTTPS in production', () => {
    expect(parseFrontendOrigin('https://app.hss-finance.example', true)).toBe(
      'https://app.hss-finance.example',
    );
    expect(() => parseFrontendOrigin('http://app.hss-finance.example', true)).toThrow(
      'FRONTEND_ORIGIN must be a valid HTTP or HTTPS origin without a path.',
    );
  });

  it.each([
    '*',
    'https://user:password@example.com',
    'https://example.com/',
    'https://example.com/path',
    'https://example.com?query=true',
    'https://example.com#fragment',
  ])('rejects a non-canonical origin: %s', (origin) => {
    expect(() => parseFrontendOrigin(origin)).toThrow(
      'FRONTEND_ORIGIN must be a valid HTTP or HTTPS origin without a path.',
    );
  });
});

describe('NODE_ENV configuration', () => {
  it.each(['development', 'test', 'production'] as const)('accepts %s', (environment) => {
    expect(parseNodeEnvironment(environment)).toBe(environment);
  });

  it.each([undefined, 'staging', 'prod'])('rejects an unsupported value: %s', (environment) => {
    expect(() => parseNodeEnvironment(environment)).toThrow(
      'NODE_ENV must be development, test, or production.',
    );
  });
});

describe('session cookie configuration', () => {
  it('enables Secure only when requested for production', () => {
    expect(createSessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      maxAge: 3_600_000,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
    expect(createSessionCookieOptions(false).secure).toBe(false);
  });
});
