import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';

const BEARER_TOKEN_PATTERN = /^Bearer ([^\s]+)$/;
const userIdSchema = z.uuid();

export function createAuthenticationMiddleware(jwtSecret: Uint8Array): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.get('authorization');
    const match = authorization?.match(BEARER_TOKEN_PATTERN);
    const token = match?.[1];

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
