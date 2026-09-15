import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest, clearAccessTokenProvider, setAccessTokenProvider } from '../lib/http';
import { authQueryKey } from './auth-api';
import { useAuth } from './auth-context';
import { AuthProvider } from './auth-provider';

const authenticatedUser = {
  id: '4f8b5484-e733-45f9-9744-a756b1baa1ef',
  name: 'Harry Sousa',
  email: 'harry@example.com',
  createdAt: '2026-09-13T15:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function AuthState() {
  const auth = useAuth();

  return (
    <div>
      <p>{auth.status}</p>
      <p>{auth.user?.email ?? 'no user'}</p>
      <button
        type="button"
        onClick={() => auth.login({ email: 'harry@example.com', password: 'password' })}
      >
        Login
      </button>
      <button type="button" onClick={() => auth.logout().catch(() => undefined)}>
        Logout
      </button>
    </div>
  );
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe('AuthProvider', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    clearAccessTokenProvider();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('reports loading while the session is being restored', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AuthState />, { wrapper: createWrapper(queryClient) });

    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('restores an authenticated session through the cookie-backed request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: authenticatedUser }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AuthState />, { wrapper: createWrapper(queryClient) });

    expect(await screen.findByText('authenticated')).toBeInTheDocument();
    expect(screen.getByText(authenticatedUser.email)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it.each([401, 403])(
    'reports unauthenticated when session restoration returns %s',
    async (status) => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          status,
        ),
      );
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(<AuthState />, { wrapper: createWrapper(queryClient) });

      expect(await screen.findByText('unauthenticated')).toBeInTheDocument();
      expect(screen.getByText('no user')).toBeInTheDocument();
    },
  );

  it('reports a temporary error instead of logging out on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AuthState />, { wrapper: createWrapper(queryClient) });

    expect(await screen.findByText('error')).toBeInTheDocument();
    expect(screen.queryByText('unauthenticated')).not.toBeInTheDocument();
  });

  it('reports a temporary error instead of logging out on a server failure', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
        503,
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AuthState />, { wrapper: createWrapper(queryClient) });

    expect(await screen.findByText('error')).toBeInTheDocument();
    expect(screen.queryByText('unauthenticated')).not.toBeInTheDocument();
  });

  it('does not keep stale authenticated data after a 401 revalidation', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: authenticatedUser }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401),
      );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AuthState />, { wrapper: createWrapper(queryClient) });
    await screen.findByText('authenticated');
    await queryClient.invalidateQueries({ queryKey: authQueryKey, exact: true });

    expect(await screen.findByText('unauthenticated')).toBeInTheDocument();
    expect(screen.getByText('no user')).toBeInTheDocument();
  });

  it('reports a temporary error when revalidation fails with stale user data', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: authenticatedUser }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AuthState />, { wrapper: createWrapper(queryClient) });
    await screen.findByText('authenticated');
    await queryClient.invalidateQueries({ queryKey: authQueryKey, exact: true });

    expect(await screen.findByText('error')).toBeInTheDocument();
    expect(screen.getByText('no user')).toBeInTheDocument();
    expect(screen.queryByText('unauthenticated')).not.toBeInTheDocument();
  });

  it('refetches the current user after login without storing the returned token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { accessToken: 'browser-must-not-store-this-token' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: authenticatedUser }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(<AuthState />, { wrapper: createWrapper(queryClient) });
    await screen.findByText('unauthenticated');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('authenticated')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(queryClient.getQueryData(authQueryKey)).toEqual(authenticatedUser);
  });

  it('clears the auth query after logout', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: authenticatedUser }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    setAccessTokenProvider(() => 'temporary-access-token');

    render(<AuthState />, { wrapper: createWrapper(queryClient) });
    await screen.findByText('authenticated');
    await user.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    expect(queryClient.getQueryData(authQueryKey)).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:3000/api/auth/logout',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: null }));
    await apiRequest('/health');
    const requestOptions = fetchMock.mock.calls.at(-1)?.[1];
    expect(new Headers(requestOptions?.headers).has('Authorization')).toBe(false);
  });

  it('keeps the authenticated session when logout fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: authenticatedUser }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
          500,
        ),
      );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(<AuthState />, { wrapper: createWrapper(queryClient) });
    await screen.findByText('authenticated');
    await user.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText('authenticated')).toBeInTheDocument();
    expect(queryClient.getQueryData(authQueryKey)).toEqual(authenticatedUser);
  });
});
