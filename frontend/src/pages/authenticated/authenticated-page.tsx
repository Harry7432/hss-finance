import { useAuth } from '../../auth/auth-context';

export function AuthenticatedPage() {
  const auth = useAuth();

  return (
    <main>
      <h1>Área autenticada</h1>
      <p>Rota técnica reservada para a futura aplicação.</p>
      <button type="button" onClick={() => auth.logout().catch(() => undefined)}>
        Sair
      </button>
    </main>
  );
}
