import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { GetCurrentUserService } from '../services/get-current-user-service.js';

export function createGetCurrentUserController(service: GetCurrentUserService): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    try {
      const user = await service.execute(request.auth.userId);
      response.status(200).json({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  };
}
