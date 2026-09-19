import { useAsaasFinancialTransactions } from '../../households/use-asaas-financial-transactions';
import { ApiError } from '../../lib/api-error';
import { formatCurrencyBRL } from '../../lib/currency';
import { formatDateOnlyPtBR } from '../../lib/date-only';
import { ErrorNotice } from '../error-notice';

function resolveStatementErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 503) {
    return {
      title: 'A integração com o Asaas não está configurada.',
      description: 'Fale com quem administra o HSS Finance para habilitar a conexão.',
    };
  }

  return {
    title: 'Não foi possível carregar o extrato agora.',
    description: 'Tente novamente em instantes.',
  };
}

function amountToneClass(value: number): string {
  return value < 0 ? 'text-expense' : 'text-income';
}

export function AsaasStatementCard({ householdId }: { householdId: string | undefined }) {
  const statementQuery = useAsaasFinancialTransactions(householdId);

  return (
    <section className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">Extrato Asaas</h2>

      {statementQuery.isPending ? (
        <>
          <p role="status" className="sr-only">
            Carregando extrato...
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
            <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
            <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
          </div>
        </>
      ) : null}

      {statementQuery.isError ? (
        <div className="mt-4">
          {(() => {
            const { title, description } = resolveStatementErrorMessage(statementQuery.error);

            return (
              <ErrorNotice
                title={title}
                description={description}
                onRetry={() => statementQuery.refetch()}
              />
            );
          })()}
        </div>
      ) : null}

      {statementQuery.data ? (
        statementQuery.data.transactions.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            Nenhuma movimentação encontrada na conta Asaas ainda.
          </p>
        ) : (
          <ul aria-label="Movimentações Asaas" className="mt-4 flex flex-col gap-3">
            {statementQuery.data.transactions.map((transaction) => (
              <li
                key={transaction.id}
                className="flex items-start justify-between gap-3 border-b border-line/10 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {transaction.description ?? 'Movimentação Asaas'}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateOnlyPtBR(transaction.date)} · {transaction.type}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-semibold tabular-nums ${amountToneClass(transaction.value)}`}>
                    {formatCurrencyBRL(String(transaction.value))}
                  </p>
                  {transaction.balance !== null ? (
                    <p className="text-xs text-ink-muted">
                      Saldo: {formatCurrencyBRL(String(transaction.balance))}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
