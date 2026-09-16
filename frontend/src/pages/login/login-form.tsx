import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { PasswordField } from '../../components/form/password-field';
import { TextField } from '../../components/form/text-field';
import { ApiError } from '../../lib/api-error';
import { useAuth } from '../../auth/auth-context';

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'E-mail ou senha incorretos.';
  }

  return 'Não foi possível entrar agora. Tente novamente em instantes.';
}

interface LoginFormProps {
  registrationSuccess?: boolean;
}

export function LoginForm({ registrationSuccess = false }: LoginFormProps) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    submitForm(event).catch(() => undefined);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await auth.login({ email, password });
    } catch (error: unknown) {
      setErrorMessage(resolveErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Entrar</h1>

      {registrationSuccess ? (
        <p
          role="status"
          className="rounded-lg border border-income/30 bg-income/10 px-4 py-3 text-sm font-medium text-income"
        >
          Cadastro concluído! Faça login para continuar.
        </p>
      ) : null}

      <fieldset disabled={isSubmitting} className="flex flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Dados de acesso</legend>

        <TextField
          label="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="voce@email.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <PasswordField
          label="Senha"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
        {isSubmitting ? 'Entrando...' : 'Entrar'}
      </button>

      <div className="flex flex-col items-center gap-2 text-sm text-ink-muted">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="cursor-not-allowed underline decoration-dotted underline-offset-4 disabled:opacity-70"
        >
          Esqueci minha senha (em breve)
        </button>
        <p>
          Não tem uma conta?{' '}
          <Link
            to="/register"
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </form>
  );
}
