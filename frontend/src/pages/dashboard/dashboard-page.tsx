import { useAuth } from '../../auth/auth-context';

export function DashboardPage() {
  const auth = useAuth();
  const firstName = auth.user?.name.split(' ')[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Visão geral</h1>
        <p className="mt-1 text-ink-muted">
          {firstName ? `Olá, ${firstName}. ` : ''}
          Acompanhe aqui o resumo financeiro da sua família.
        </p>
      </div>

      <section
        aria-labelledby="summary-placeholder-title"
        className="rounded-2xl border border-line/15 bg-surface p-6 text-center sm:p-10"
      >
        <h2 id="summary-placeholder-title" className="sr-only">
          Resumo financeiro
        </h2>
        <p className="text-ink-muted">Resumo financeiro será exibido aqui.</p>
      </section>
    </div>
  );
}
