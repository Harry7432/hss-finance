import type { RequestHandler } from 'express';
import { z } from 'zod';

import { InvalidCredentialsError } from '../errors/invalid-credentials-error.js';
import type { LoginUserService } from '../services/login-user-service.js';

const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export function createLoginController(service: LoginUserService): RequestHandler {
  return async (request, response, next) => {
    const parsedPayload = loginSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
        },
      });
      return;
    }

    try {
      const result = await service.execute(parsedPayload.data);
      response.status(200).json({ data: result });
    } catch (error: unknown) {
      if (error instanceof InvalidCredentialsError) {
        response.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: error.message,
          },
        });
        return;
      }

      next(error);
    }
  };
}
