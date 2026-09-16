import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RegisterForm } from './register-form';

// Typing four fields with userEvent is noticeably slower under v8 coverage
// instrumentation than the default 5s test timeout allows.
vi.setConfig({ testTimeout: 15000 });

const VALID_PASSWORD = 'super-secret-password';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function successResponse(): Response {
  return jsonResponse(
    {
      data: {
        id: '4f8b5484-e733-45f9-9744-a756b1baa1ef',
        name: 'Harry Sousa',
        email: 'harry@example.com',
        createdAt: '2026-09-13T15:00:00.000Z',
      },
    },
    201,
  );
}

function LoginStub() {
  const location = useLocation();
  const state = location.state as { registered?: boolean } | null;

  return <p>Login stub - registered: {String(Boolean(state?.registered))}</p>;
}

function renderRegisterForm() {
  const router = createMemoryRouter(
    [
      { path: '/register', element: <RegisterForm /> },
      { path: '/login', element: <LoginStub /> },
    ],
    { initialEntries: ['/register'] },
  );

  render(<RouterProvider router={router} />);
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nome'), 'Harry Sousa');
  await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
  await user.type(screen.getByLabelText('Senha'), VALID_PASSWORD);
  await user.type(screen.getByLabelText('Confirmar senha'), VALID_PASSWORD);
}

describe('RegisterForm', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('renders real labels with the correct input types and autocomplete', () => {
    renderRegisterForm();

    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();

    const nameInput = screen.getByLabelText('Nome');
    const emailInput = screen.getByLabelText('E-mail');
    const passwordInput = screen.getByLabelText('Senha');
    const confirmInput = screen.getByLabelText('Confirmar senha');

    expect(nameInput).toHaveAttribute('autocomplete', 'name');
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('autocomplete', 'email');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmInput).toHaveAttribute('type', 'password');
    expect(confirmInput).toHaveAttribute('autocomplete', 'new-password');
  });

  it('sends the real payload to POST /api/auth/register', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(successResponse());

    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:3000/api/auth/register');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Harry Sousa',
      email: 'harry@example.com',
      password: VALID_PASSWORD,
    });
  });

  it('requires every field before submitting, without calling the backend', async () => {
    const user = userEvent.setup();
    renderRegisterForm();

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(screen.getByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe uma senha.')).toBeInTheDocument();
    expect(screen.getByText('Confirme sua senha.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks submission and shows an accessible field error when the passwords do not match', async () => {
    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText('Nome'), 'Harry Sousa');
    await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
    await user.type(screen.getByLabelText('Senha'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirmar senha'), 'a-different-password');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const confirmInput = screen.getByLabelText('Confirmar senha');
    expect(confirmInput).toHaveAttribute('aria-invalid', 'true');
    expect(confirmInput).toHaveAccessibleDescription('As senhas não coincidem.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags a password shorter than the 12-character backend minimum before submitting', async () => {
    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText('Nome'), 'Harry Sousa');
    await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
    await user.type(screen.getByLabelText('Senha'), 'short-pass');
    await user.type(screen.getByLabelText('Confirmar senha'), 'short-pass');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(screen.getByText('A senha deve ter pelo menos 12 caracteres.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the name and email errors once each field becomes non-empty', async () => {
    const user = userEvent.setup();
    renderRegisterForm();

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(screen.getByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome'), 'Harry Sousa');
    expect(screen.queryByText('Informe seu nome.')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('E-mail'), 'harry@example.com');
    expect(screen.queryByText('Informe seu e-mail.')).not.toBeInTheDocument();
  });

  it('clears the confirm-password mismatch once it matches the password again', async () => {
    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText('Senha'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirmar senha'), 'a-different-password');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Confirmar senha'));
    await user.type(screen.getByLabelText('Confirmar senha'), VALID_PASSWORD);
    expect(screen.queryByText('As senhas não coincidem.')).not.toBeInTheDocument();
  });

  it('clears the confirm-password mismatch when the password itself is edited to match', async () => {
    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText('Senha'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirmar senha'), 'a-different-password-x');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Senha'));
    await user.type(screen.getByLabelText('Senha'), 'a-different-password-x');
    expect(screen.queryByText('As senhas não coincidem.')).not.toBeInTheDocument();
  });

  it('shows a specific message for a duplicate email (409) without a field error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email already registered' } },
        409,
      ),
    );

    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Este e-mail já está cadastrado.');
  });

  it('shows a generic message for a 400 without leaking backend error codes', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' } },
        400,
      ),
    );

    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Verifique os dados informados');
    expect(alert).not.toHaveTextContent('VALIDATION_ERROR');
  });

  it('shows a temporary-error message for network failures', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível concluir seu cadastro agora.');
  });

  it('shows a generic message for an unexpected server error (500)', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
        500,
      ),
    );

    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível concluir seu cadastro agora.');
  });

  it('shows a loading state, disables the fields and blocks a second submit while pending', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const pendingButton = screen.getByRole('button', { name: 'Criando conta...' });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByLabelText('Nome')).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.getByLabelText('Senha')).toBeDisabled();
    expect(screen.getByLabelText('Confirmar senha')).toBeDisabled();

    await user.click(pendingButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(successResponse());
    await screen.findByText(/Login stub/);
  });

  it('redirects to /login carrying a registered flag after a successful registration', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(successResponse());

    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Login stub - registered: true')).toBeInTheDocument();
  });

  it('links to /login to sign in', () => {
    renderRegisterForm();

    const loginLink = screen.getByRole('link', { name: 'Entrar' });
    expect(loginLink).toHaveAttribute('href', '/login');
  });
});
