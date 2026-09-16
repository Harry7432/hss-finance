import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../../auth/auth-provider';
import { LoginPage } from '../login/login-page';
import { RegisterPage } from './register-page';

// Typing four fields with userEvent is noticeably slower under v8 coverage
// instrumentation than the default 5s test timeout allows.
vi.setConfig({ testTimeout: 15000 });

const VALID_PASSWORD = 'super-secret-password';

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

function renderRegisterPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/register', element: <RegisterPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/app', element: <p>Área autenticada (stub)</p> },
    ],
    { initialEntries: ['/register'] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('RegisterPage', () => {
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

    renderRegisterPage();

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão');
  });

  it('offers a retry action when session restoration fails temporarily', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    renderRegisterPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível verificar sua sessão',
    );
    const retryButton = screen.getByRole('button', { name: 'Tentar novamente' });
    const callsBeforeRetry = fetchMock.mock.calls.length;

    await user.click(retryButton);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('renders the real register form for an unauthenticated visitor', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401),
    );

    renderRegisterPage();

    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar senha')).toBeInTheDocument();
  });

  it('redirects an already authenticated user away from /register', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: authenticatedUser }));

    renderRegisterPage();

    expect(await screen.findByText('Área autenticada (stub)')).toBeInTheDocument();
  });

  it('registers, lands on the real login page, and shows the success feedback', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith('/auth/me')) {
        return Promise.resolve(
          jsonResponse(
            { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
            401,
          ),
        );
      }

      if (url.endsWith('/auth/register')) {
        return Promise.resolve(jsonResponse({ data: authenticatedUser }, 201));
      }

      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });

    renderRegisterPage();
    await screen.findByRole('heading', { name: 'Criar conta' });

    await user.type(screen.getByLabelText('Nome'), 'Harry Sousa');
    await user.type(screen.getByLabelText('E-mail'), authenticatedUser.email);
    await user.type(screen.getByLabelText('Senha'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirmar senha'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Cadastro concluído! Faça login para continuar.',
    );
  });

  it('links back to /login to sign in', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401),
    );

    renderRegisterPage();
    await screen.findByRole('heading', { name: 'Criar conta' });

    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
  });
});
