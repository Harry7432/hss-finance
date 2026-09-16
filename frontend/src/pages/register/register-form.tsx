import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { register } from '../../auth/auth-api';
import { PasswordField } from '../../components/form/password-field';
import { TextField } from '../../components/form/text-field';
import { ApiError } from '../../lib/api-error';

const MIN_PASSWORD_LENGTH = 12;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Este e-mail já está cadastrado. Tente entrar ou use outro e-mail.';
  }

  if (error instanceof ApiError && error.status === 400) {
    return 'Verifique os dados informados e tente novamente.';
  }

  return 'Não foi possível concluir seu cadastro agora. Tente novamente em instantes.';
}

export function RegisterForm() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setName(value);

    if (fieldErrors.name && value.trim().length > 0) {
      setFieldErrors((current) => ({ ...current, name: undefined }));
    }
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setEmail(value);

    if (fieldErrors.email && value.trim().length > 0) {
      setFieldErrors((current) => ({ ...current, email: undefined }));
    }
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setPassword(value);

    setFieldErrors((current) => ({
      ...current,
      password:
        current.password && value.length >= MIN_PASSWORD_LENGTH ? undefined : current.password,
      confirmPassword:
        current.confirmPassword && value === confirmPassword ? undefined : current.confirmPassword,
    }));
  }

  function handleConfirmPasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setConfirmPassword(value);

    if (fieldErrors.confirmPassword && value === password) {
      setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
    }
  }

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (name.trim().length === 0) {
      errors.name = 'Informe seu nome.';
    }

    if (email.trim().length === 0) {
      errors.email = 'Informe seu e-mail.';
    }

    if (password.length === 0) {
      errors.password = 'Informe uma senha.';
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }

    if (confirmPassword.length === 0) {
      errors.confirmPassword = 'Confirme sua senha.';
    } else if (confirmPassword !== password) {
      errors.confirmPassword = 'As senhas não coincidem.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    submitForm(event).catch(() => undefined);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setErrorMessage(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await register({ name: name.trim(), email: email.trim(), password });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (error: unknown) {
      setErrorMessage(resolveErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Criar conta</h1>

      <fieldset disabled={isSubmitting} className="flex flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Dados de cadastro</legend>

        <TextField
          label="Nome"
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Seu nome completo"
          required
          value={name}
          onChange={handleNameChange}
          error={fieldErrors.name}
        />

        <TextField
          label="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="voce@email.com"
          required
          value={email}
          onChange={handleEmailChange}
          error={fieldErrors.email}
        />

        <PasswordField
          label="Senha"
          name="password"
          autoComplete="new-password"
          placeholder="Mínimo de 12 caracteres"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={handlePasswordChange}
          error={fieldErrors.password}
        />

        <PasswordField
          label="Confirmar senha"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Repita a senha"
          required
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          error={fieldErrors.confirmPassword}
        />
      </fieldset>

      {errorMessage ? (
        <p role="alert" className="text-sm font-medium text-expense">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-11 w-full rounded-lg bg-brand font-semibold text-on-brand transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? 'Criando conta...' : 'Criar conta'}
      </button>

      <p className="text-center text-sm text-ink-muted">
        Já tem uma conta?{' '}
        <Link to="/login" className="font-medium text-brand underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
