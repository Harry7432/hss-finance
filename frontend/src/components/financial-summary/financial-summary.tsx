import { useActiveHousehold } from '../../households/use-active-household';
import { useHouseholdSummary } from '../../households/use-household-summary';
import { ApiError } from '../../lib/api-error';
import { formatCurrencyBRL } from '../../lib/currency';
import { ErrorNotice } from '../error-notice';
import { SummaryCard } from './summary-card';

function SummarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <p role="status" className="sr-only">
        Carregando resumo financeiro...
      </p>
      <div
        aria-hidden="true"
        className="h-28 animate-pulse rounded-2xl border border-line/15 bg-surface sm:col-span-2"
      />
      <div
        aria-hidden="true"
        className="h-24 animate-pulse rounded-2xl border border-line/15 bg-surface"
      />
      <div
        aria-hidden="true"
        className="h-24 animate-pulse rounded-2xl border border-line/15 bg-surface"
      />
    </div>
  );
}

function resolveSummaryErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 403) {
    return {
      title: 'Não foi possível carregar os dados desta família.',
      description: 'Verifique se você ainda faz parte dela ou tente novamente.',
    };
  }

  return {
    title: 'Não foi possível carregar o resumo financeiro agora.',
    description: 'Tente novamente em instantes.',
  };
}

export function FinancialSummary() {
  const { householdsQuery, activeHousehold } = useActiveHousehold();
  const summaryQuery = useHouseholdSummary(activeHousehold?.id);

  if (householdsQuery.isPending || (activeHousehold !== undefined && summaryQuery.isPending)) {
    return <SummarySkeleton />;
  }

  if (householdsQuery.isError) {
    return (
      <ErrorNotice
        title="Não foi possível carregar suas famílias agora."
        description="Tente novamente em instantes."
        onRetry={() => householdsQuery.refetch()}
      />
    );
  }

  if (!activeHousehold) {
    return (
      <div className="rounded-2xl border border-line/15 bg-surface p-6 text-center">
        <p className="text-ink-muted">
          Você ainda não faz parte de nenhuma família no HSS Finance.
        </p>
      </div>
    );
  }

  if (summaryQuery.isError) {
    const { title, description } = resolveSummaryErrorMessage(summaryQuery.error);

    return (
      <ErrorNotice title={title} description={description} onRetry={() => summaryQuery.refetch()} />
    );
  }

  const summary = summaryQuery.data;

  if (!summary) {
    return null;
  }

  const hasNoMovement =
    summary.totalIncome === '0.00' && summary.totalExpense === '0.00' && summary.balance === '0.00';

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          title="Saldo"
          value={formatCurrencyBRL(summary.balance)}
          emphasis
          className="sm:col-span-2"
        />
        <SummaryCard
          title="Receitas"
          value={formatCurrencyBRL(summary.totalIncome)}
          tone="income"
        />
        <SummaryCard
          title="Despesas"
          value={formatCurrencyBRL(summary.totalExpense)}
          tone="expense"
        />
      </div>
      {hasNoMovement ? (
        <p className="text-sm text-ink-muted">Nenhuma movimentação registrada ainda.</p>
      ) : null}
    </div>
  );
}
