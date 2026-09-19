export function AsaasConnectionCard() {
  return (
    <section className="rounded-2xl border border-line/15 bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Conta Asaas</h2>
          <p className="mt-1 text-sm text-ink-muted">Conectada ao ambiente Sandbox</p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-pending/30 bg-pending/10 px-3 py-1 text-xs font-semibold text-pending">
          Sandbox / Homologação
        </span>
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        A conexão com o Asaas é configurada e mantida pelo backend. Nenhuma credencial de acesso é
        exibida ou solicitada aqui.
      </p>
    </section>
  );
}
