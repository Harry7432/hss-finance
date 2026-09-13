import type { ErrorRequestHandler } from 'express';

function isMalformedJsonError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return 'type' in error && error.type === 'entity.parse.failed';
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
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
