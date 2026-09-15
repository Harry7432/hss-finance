import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_EXPIRATION_SECONDS = 3_600;
export const SESSION_COOKIE_NAME = 'hss_finance_session';

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
} as const;

export function createSessionCookieOptions(secure: boolean): CookieOptions {
  return {
    ...BASE_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_EXPIRATION_SECONDS * 1_000,
    secure,
  };
}

export function createSessionCookieClearOptions(secure: boolean): CookieOptions {
  return {
    ...BASE_COOKIE_OPTIONS,
    secure,
  };
}
