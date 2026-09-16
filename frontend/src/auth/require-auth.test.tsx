import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from './auth-context';
import { RequireAuth } from './require-auth';

function renderRequireAuth(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    status: 'loading',
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };

  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [{ path: 'app', element: <p>Conteúdo protegido</p> }],
      },
      { path: 'login', element: <p>Página de login</p> },
    ],
    { initialEntries: ['/app'] },
  );

  render(
    <AuthContext value={value}>
      <RouterProvider router={router} />
    </AuthContext>,
  );

  return { retry: value.retry };
}

describe('RequireAuth', () => {
  it('shows a styled loading state while the session is being verified', () => {
    renderRequireAuth({ status: 'loading' });

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão...');
  });

  it('shows a styled retry action when session verification fails', async () => {
    const user = userEvent.setup();
    const retry = vi.fn().mockResolvedValue(undefined);
    renderRequireAuth({ status: 'error', retry });

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível verificar sua sessão.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('redirects to login when unauthenticated', async () => {
    renderRequireAuth({ status: 'unauthenticated' });

    expect(await screen.findByText('Página de login')).toBeInTheDocument();
  });

  it('renders the protected content when authenticated', () => {
    renderRequireAuth({ status: 'authenticated' });

    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument();
  });
});
