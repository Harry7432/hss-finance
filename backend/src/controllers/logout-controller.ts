import type { RequestHandler } from 'express';

import { createSessionCookieClearOptions, SESSION_COOKIE_NAME } from '../config/session.js';

export function createLogoutController(secureCookie: boolean): RequestHandler {
  return (_request, response) => {
    response.clearCookie(SESSION_COOKIE_NAME, createSessionCookieClearOptions(secureCookie));
    response.set('Cache-Control', 'no-store');
    response.status(204).send();
  };
}
