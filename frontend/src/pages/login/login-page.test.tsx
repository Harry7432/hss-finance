import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../../auth/auth-provider';
import { LoginPage } from './login-page';

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

function renderLoginPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/app', element: <p>Área autenticada (stub)</p> },
    ],
    { initialEntries: ['/login'] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows a status message while the session is being restored', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderLoginPage();

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão');
  });

  it('offers a retry action when session restoration fails temporarily', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    renderLoginPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível verificar sua sessão',
    );
    const retryButton = screen.getByRole('button', { name: 'Tentar novamente' });
    const callsBeforeRetry = fetchMock.mock.calls.length;

    await user.click(retryButton);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('renders the real login form for an unauthenticated visitor', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401),
    );

    renderLoginPage();

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('logs in successfully, leaves /login, and never persists the token manually', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { accessToken: 'browser-must-not-store-this-token' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: authenticatedUser }));

    renderLoginPage();
    await screen.findByRole('heading', { name: 'Entrar' });

    await user.type(screen.getByLabelText('E-mail'), authenticatedUser.email);
    await user.type(screen.getByLabelText('Senha'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Área autenticada (stub)')).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('shows invalid-credentials feedback and stays on the login form', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } },
          401,
        ),
      );

    renderLoginPage();
    await screen.findByRole('heading', { name: 'Entrar' });

    await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
    await user.type(screen.getByLabelText('Senha'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
