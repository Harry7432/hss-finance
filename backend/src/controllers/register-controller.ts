import type { RequestHandler } from 'express';
import { z } from 'zod';

import { EmailAlreadyExistsError } from '../errors/email-already-exists-error.js';
import type { RegisterUserService } from '../services/register-user-service.js';

const registerUserSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});

export function createRegisterController(service: RegisterUserService): RequestHandler {
  return async (request, response, next) => {
    const parsedPayload = registerUserSchema.safeParse(request.body);

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
      const user = await service.execute(parsedPayload.data);

      response.status(201).json({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        },
      });
    } catch (error: unknown) {
      if (error instanceof EmailAlreadyExistsError) {
        response.status(409).json({
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: error.message,
          },
        });
        return;
      }

      next(error);
    }
  };
}
