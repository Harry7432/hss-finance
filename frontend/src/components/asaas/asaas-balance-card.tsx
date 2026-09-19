import { useAsaasBalance } from '../../households/use-asaas-balance';
import { ApiError } from '../../lib/api-error';
import { formatCurrencyBRL } from '../../lib/currency';
import { ErrorNotice } from '../error-notice';

function resolveBalanceErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 503) {
    return {
      title: 'A integração com o Asaas não está configurada.',
      description: 'Fale com quem administra o HSS Finance para habilitar a conexão.',
    };
  }

  return {
    title: 'Não foi possível consultar o saldo agora.',
    description: 'Tente novamente em instantes.',
  };
}

export function AsaasBalanceCard({ householdId }: { householdId: string | undefined }) {
  const balanceQuery = useAsaasBalance(householdId);

  return (
    <section className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 className="text-sm font-medium text-ink-muted">Saldo Asaas</h2>

      {balanceQuery.isPending ? (
        <>
          <p role="status" className="sr-only">
            Carregando saldo...
          </p>
          <div aria-hidden="true" className="mt-2 h-9 w-32 animate-pulse rounded-lg bg-page" />
        </>
      ) : null}

      {balanceQuery.isError ? (
        <div className="mt-2">
          {(() => {
            const { title, description } = resolveBalanceErrorMessage(balanceQuery.error);

            return (
              <ErrorNotice
                title={title}
                description={description}
                onRetry={() => balanceQuery.refetch()}
              />
            );
          })()}
        </div>
      ) : null}

      {balanceQuery.data ? (
        <p className="mt-2 text-3xl font-semibold tracking-[-0.01em] text-ink">
          {formatCurrencyBRL(String(balanceQuery.data.balance))}
        </p>
      ) : null}
    </section>
  );
}
