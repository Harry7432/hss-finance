import { describe, expect, it } from 'vitest';

import { ApiError } from '../lib/api-error';
import { shouldRetryQuery } from './query-client';

describe('shouldRetryQuery', () => {
  it('does not retry client and authentication errors', () => {
    expect(shouldRetryQuery(0, new ApiError(401, 'UNAUTHORIZED', 'Authentication required'))).toBe(
      false,
    );
    expect(shouldRetryQuery(0, new ApiError(422, 'VALIDATION_ERROR', 'Invalid payload'))).toBe(
      false,
    );
  });

  it('retries network and server failures once', () => {
    expect(shouldRetryQuery(0, new ApiError(0, 'NETWORK_ERROR', 'Network failed'))).toBe(true);
    expect(shouldRetryQuery(0, new ApiError(503, 'UNAVAILABLE', 'Service unavailable'))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(503, 'UNAVAILABLE', 'Service unavailable'))).toBe(
      false,
    );
  });
});
