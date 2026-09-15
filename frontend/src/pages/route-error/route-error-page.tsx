import { Link } from 'react-router';

export function RouteErrorPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-page px-5 py-10 text-center sm:px-8">
      <section aria-labelledby="route-error-title">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-expense">
          Algo deu errado
        </p>
        <h1 id="route-error-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          Não foi possível carregar esta página
        </h1>
        <p className="mt-3 text-ink-muted">Tente novamente ou retorne ao início.</p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-5 font-semibold text-ink transition-colors hover:bg-page"
          to="/"
        >
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}
