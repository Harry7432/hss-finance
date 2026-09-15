import { Navigate } from 'react-router';

import { useAuth } from '../../auth/auth-context';

export function LoginPage() {
  const auth = useAuth();

  if (auth.status === 'authenticated') {
    return <Navigate to="/app" replace />;
  }

  if (auth.status === 'loading') {
    return <p role="status">Verificando sessão...</p>;
  }

  if (auth.status === 'error') {
    return (
      <div role="alert">
        <p>Não foi possível verificar sua sessão.</p>
        <button type="button" onClick={() => auth.retry()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <main>
      <h1>Entrar</h1>
      <p>A interface de autenticação será implementada em um próximo slice.</p>
    </main>
  );
}
