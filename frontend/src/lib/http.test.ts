import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-error';
import { apiRequest, clearAccessTokenProvider, setAccessTokenProvider } from './http';

describe('apiRequest', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    clearAccessTokenProvider();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns data from a successful API envelope', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'user-id' } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await expect(apiRequest<{ id: string }>('/auth/me')).resolves.toEqual({ id: 'user-id' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/me',
      expect.objectContaining({ credentials: 'same-origin', method: 'GET' }),
    );

    const requestOptions = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestOptions?.headers).has('Authorization')).toBe(false);
  });

  it('adds the access token to the authorization header', async () => {
    setAccessTokenProvider(() => 'access-token');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: null }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await apiRequest('/auth/me');

    const requestOptions = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestOptions?.headers).get('Authorization')).toBe('Bearer access-token');
  });

  it('throws the error returned by the API', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
        {
          headers: { 'Content-Type': 'application/problem+json' },
          status: 401,
        },
      ),
    );

    await expect(apiRequest('/auth/me')).rejects.toEqual(
      new ApiError(401, 'UNAUTHORIZED', 'Authentication required'),
    );
  });

  it('normalizes network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/health')).rejects.toEqual(
      new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar ao servidor.'),
    );
  });

  it('returns undefined for successful responses without a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest<void>('/resource', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('rejects successful responses outside the API envelope', async () => {
    fetchMock.mockResolvedValue(
      new Response('not-json', {
        headers: { 'Content-Type': 'text/plain' },
        status: 200,
      }),
    );

    await expect(apiRequest('/resource')).rejects.toEqual(
      new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.'),
    );
  });

  it('allows cookie credentials to be enabled per request', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: null }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await apiRequest('/auth/me', { credentials: 'include' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('preserves abort errors for request cancellation', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    controller.abort();
    fetchMock.mockRejectedValue(abortError);

    await expect(apiRequest('/resource', { signal: controller.signal })).rejects.toBe(abortError);
  });
});
