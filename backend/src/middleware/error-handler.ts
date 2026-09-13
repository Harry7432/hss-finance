import type { ErrorRequestHandler } from 'express';

import { ForbiddenError } from '../errors/forbidden-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';

function isMalformedJsonError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return 'type' in error && error.type === 'entity.parse.failed';
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof UnauthorizedError) {
    response.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof ForbiddenError) {
    response.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: error.message,
      },
    });
    return;
  }

  if (isMalformedJsonError(error)) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
      },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    },
  });
};
