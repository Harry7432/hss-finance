import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-page px-5 py-10 text-center sm:px-8">
      <section aria-labelledby="not-found-title">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand">Erro 404</p>
        <h1 id="not-found-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          Página não encontrada
        </h1>
        <p className="mt-3 text-ink-muted">O endereço informado não existe.</p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-on-brand transition-colors hover:bg-brand-strong"
          to="/"
        >
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}
