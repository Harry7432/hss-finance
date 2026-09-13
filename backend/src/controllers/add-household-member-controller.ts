import type { RequestHandler } from 'express';
import { z } from 'zod';

import { AlreadyHouseholdMemberError } from '../errors/already-household-member-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import { UserNotFoundError } from '../errors/user-not-found-error.js';
import type { AddHouseholdMemberService } from '../services/add-household-member-service.js';

const householdIdSchema = z.uuid();
const addHouseholdMemberSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
});

export function createAddHouseholdMemberController(
  service: AddHouseholdMemberService,
): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    const parsedHouseholdId = householdIdSchema.safeParse(request.params.householdId);

    if (!parsedHouseholdId.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      return;
    }

    const parsedPayload = addHouseholdMemberSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      return;
    }

    try {
      const member = await service.execute(
        parsedHouseholdId.data,
        request.auth.userId,
        parsedPayload.data.email,
      );

      response.status(201).json({
        data: {
          userId: member.userId,
          name: member.name,
          email: member.email,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
        },
      });
    } catch (error: unknown) {
      if (error instanceof UserNotFoundError) {
        response.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: error.message },
        });
        return;
      }

      if (error instanceof AlreadyHouseholdMemberError) {
        response.status(409).json({
          error: { code: 'ALREADY_HOUSEHOLD_MEMBER', message: error.message },
        });
        return;
      }

      next(error);
    }
  };
}
