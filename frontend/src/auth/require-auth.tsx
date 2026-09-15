import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './auth-context';

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return <p role="status">Verificando sessão...</p>;
  }

  if (auth.status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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

  return <Outlet />;
}
