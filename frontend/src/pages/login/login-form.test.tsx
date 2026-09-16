import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '../../auth/auth-context';
import { ApiError } from '../../lib/api-error';
import { LoginForm } from './login-form';

function renderWithAuth(
  overrides: Partial<AuthContextValue> = {},
  formProps: { registrationSuccess?: boolean } = {},
) {
  const login = vi.fn().mockResolvedValue(undefined);
  const value: AuthContextValue = {
    status: 'unauthenticated',
    user: null,
    login,
    logout: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };

  render(
    <MemoryRouter>
      <AuthContext value={value}>
        <LoginForm {...formProps} />
      </AuthContext>
    </MemoryRouter>,
  );

  return { login };
}

describe('LoginForm', () => {
  it('renders real labels with the correct input types and autocomplete', () => {
    renderWithAuth();

    const emailInput = screen.getByLabelText('E-mail');
    const passwordInput = screen.getByLabelText('Senha');

    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('autocomplete', 'email');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('submits the typed credentials to the AuthProvider', async () => {
    const user = userEvent.setup();
    const { login } = renderWithAuth();

    await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
    await user.type(screen.getByLabelText('Senha'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(login).toHaveBeenCalledWith({ email: 'harry@example.com', password: 'super-secret' });
  });

  it('shows a loading state and blocks a second submit while pending', async () => {
    const user = userEvent.setup();
    let resolveLogin: () => void = () => undefined;
    const login = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    renderWithAuth({ login });

    await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
    await user.type(screen.getByLabelText('Senha'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const pendingButton = screen.getByRole('button', { name: 'Entrando...' });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.getByLabelText('Senha')).toBeDisabled();

    await user.click(pendingButton);
    expect(login).toHaveBeenCalledTimes(1);

    resolveLogin();
    await screen.findByRole('button', { name: 'Entrar' });
  });

  it('shows a specific message for invalid credentials', async () => {
    const user = userEvent.setup();
    const login = vi
      .fn()
      .mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'));
    renderWithAuth({ login });

    await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
    await user.type(screen.getByLabelText('Senha'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('shows a temporary-error message for network/server failures without blaming the password', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Failed to fetch'));
    renderWithAuth({ login });

    await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
    await user.type(screen.getByLabelText('Senha'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível entrar agora');
    expect(alert).not.toHaveTextContent(/incorretos/);
  });

  it('toggles password visibility without changing the value', async () => {
    const user = userEvent.setup();
    renderWithAuth();

    const passwordInput = screen.getByLabelText('Senha');
    await user.type(passwordInput, 'super-secret');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(passwordInput).toHaveValue('super-secret');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the password recovery action disabled and without a real link', () => {
    renderWithAuth();

    const recoveryButton = screen.getByRole('button', { name: 'Esqueci minha senha (em breve)' });
    expect(recoveryButton).toBeDisabled();
  });

  it('links to /register to create an account', () => {
    renderWithAuth();

    const registerLink = screen.getByRole('link', { name: 'Criar conta' });
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('does not show the registration success message by default', () => {
    renderWithAuth();

    expect(
      screen.queryByText('Cadastro concluído! Faça login para continuar.'),
    ).not.toBeInTheDocument();
  });

  it('shows an accessible success status after a successful registration', () => {
    renderWithAuth({}, { registrationSuccess: true });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Cadastro concluído! Faça login para continuar.',
    );
  });
});
