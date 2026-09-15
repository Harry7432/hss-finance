import { parse } from 'cookie';
import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import { z } from 'zod';

import { SESSION_COOKIE_NAME } from '../config/session.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';

const BEARER_TOKEN_PATTERN = /^Bearer ([^\s]+)$/;
const userIdSchema = z.uuid();

export function createAuthenticationMiddleware(jwtSecret: Uint8Array): RequestHandler {
  return async (request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    const authorization = request.get('authorization');
    let token: string | undefined;

    if (authorization !== undefined) {
      token = authorization.match(BEARER_TOKEN_PATTERN)?.[1];
    } else {
      const cookieHeader = request.get('cookie');
      token = cookieHeader ? parse(cookieHeader)[SESSION_COOKIE_NAME] : undefined;
    }

    if (!token) {
      next(new UnauthorizedError());
      return;
    }

    try {
      const { payload } = await jwtVerify(token, jwtSecret, {
        algorithms: ['HS256'],
        requiredClaims: ['exp', 'sub'],
      });
      const parsedUserId = userIdSchema.safeParse(payload.sub);

      if (!parsedUserId.success) {
        next(new UnauthorizedError());
        return;
      }

      request.auth = { userId: parsedUserId.data };
      next();
    } catch {
      next(new UnauthorizedError());
    }
  };
}
