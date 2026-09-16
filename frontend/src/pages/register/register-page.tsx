import { Navigate } from 'react-router';

import { useAuth } from '../../auth/auth-context';
import { AuthShell } from '../login/auth-shell';
import { RegisterForm } from './register-form';

const SUBTITLE = 'Crie sua conta para começar a organizar as finanças da sua família.';

export function RegisterPage() {
  const auth = useAuth();

  if (auth.status === 'authenticated') {
    return <Navigate to="/app" replace />;
  }

  if (auth.status === 'loading') {
    return (
      <AuthShell subtitle={SUBTITLE}>
        <p role="status" className="text-ink-muted">
          Verificando sessão...
        </p>
      </AuthShell>
    );
  }

  if (auth.status === 'error') {
    return (
      <AuthShell subtitle={SUBTITLE}>
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-ink">Não foi possível verificar sua sessão.</p>
          <button
            type="button"
            onClick={() => auth.retry()}
            className="min-h-11 rounded-lg border border-line/45 px-4 font-medium text-ink transition-colors hover:bg-surface-alt"
          >
            Tentar novamente
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle={SUBTITLE}>
      <RegisterForm />
    </AuthShell>
  );
}
