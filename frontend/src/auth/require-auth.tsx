import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './auth-context';

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <div data-theme="dark" className="grid min-h-svh place-items-center bg-page px-5">
        <p role="status" className="text-ink-muted">
          Verificando sessão...
        </p>
      </div>
    );
  }

  if (auth.status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (auth.status === 'error') {
    return (
      <div data-theme="dark" className="grid min-h-svh place-items-center bg-page px-5 py-10">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-line/15 bg-surface p-6 text-center"
        >
          <p className="font-medium text-ink">Não foi possível verificar sua sessão.</p>
          <button
            type="button"
            onClick={() => auth.retry()}
            className="mt-4 min-h-11 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
