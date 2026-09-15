export function HomePage() {
  return (
    <main className="grid min-h-svh place-items-center bg-page px-5 py-10 sm:px-8">
      <section
        className="w-full max-w-2xl rounded-3xl border border-line bg-surface p-8 shadow-xl shadow-slate-950/5 sm:p-12"
        aria-labelledby="app-title"
      >
        <div
          className="mb-10 flex size-12 items-center justify-center rounded-2xl bg-brand text-sm font-semibold tracking-[0.12em] text-on-brand shadow-lg shadow-teal-700/20"
          aria-hidden="true"
        >
          HSS
        </div>

        <h1 id="app-title" className="text-4xl font-semibold tracking-[-0.045em] text-ink sm:text-6xl">
          HSS Finance
        </h1>
        <p className="mt-3 text-lg leading-8 text-ink-muted sm:text-xl">
          Gestão financeira familiar
        </p>

        <div className="mt-10 flex items-center gap-3 border-t border-line pt-6 text-sm leading-6 text-ink-muted">
          <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <p>A aplicação está em construção.</p>
        </div>
      </section>
    </main>
  );
}
