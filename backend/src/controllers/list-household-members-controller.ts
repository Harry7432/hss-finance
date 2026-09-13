import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { ListHouseholdMembersService } from '../services/list-household-members-service.js';

const householdIdSchema = z.uuid();

export function createListHouseholdMembersController(
  service: ListHouseholdMembersService,
): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    const parsedHouseholdId = householdIdSchema.safeParse(request.params.householdId);

    if (!parsedHouseholdId.success) {
      response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameter',
        },
      });
      return;
    }

    try {
      const members = await service.execute(parsedHouseholdId.data, request.auth.userId);
      response.status(200).json({
        data: members.map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
        })),
      });
    } catch (error: unknown) {
      next(error);
    }
  };
}
