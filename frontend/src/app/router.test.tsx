import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../auth/auth-provider';
import { appRoutes } from './router';

describe('app router', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function renderProtectedRoute(path: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(appRoutes, { initialEntries: [path] });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  it('renders a recovery path for unknown URLs', () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/unknown'] });

    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });

  it('redirects an unauthenticated user from a protected route to login', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
        { headers: { 'Content-Type': 'application/json' }, status: 401 },
      ),
    );

    renderProtectedRoute('/app');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('does not redirect a protected route while session restoration is loading', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderProtectedRoute('/app');

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão');
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('shows a temporary session error without redirecting to login', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    renderProtectedRoute('/app');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível verificar sua sessão',
    );
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('renders a protected route for an authenticated user', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: '4f8b5484-e733-45f9-9744-a756b1baa1ef',
            name: 'Harry Sousa',
            email: 'harry@example.com',
            createdAt: '2026-09-13T15:00:00.000Z',
          },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );

    renderProtectedRoute('/app');

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
  });

  it('redirects an authenticated user away from the login route', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: '4f8b5484-e733-45f9-9744-a756b1baa1ef',
            name: 'Harry Sousa',
            email: 'harry@example.com',
            createdAt: '2026-09-13T15:00:00.000Z',
          },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );

    renderProtectedRoute('/login');

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
  });

  it('leaves a protected route after a successful logout', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith('/auth/logout')) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      if (url.endsWith('/auth/me')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: '4f8b5484-e733-45f9-9744-a756b1baa1ef',
                name: 'Harry Sousa',
                email: 'harry@example.com',
                createdAt: '2026-09-13T15:00:00.000Z',
              },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );
    });

    renderProtectedRoute('/app');
    await screen.findByRole('heading', { name: 'Visão geral' });
    await user.click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
