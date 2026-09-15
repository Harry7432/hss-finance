import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../lib/api-error';

const MAX_QUERY_RETRIES = 1;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) {
    return false;
  }

  if (error instanceof ApiError) {
    return error.status === 0 || error.status >= 500;
  }

  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        staleTime: 30_000,
      },
    },
  });
}
