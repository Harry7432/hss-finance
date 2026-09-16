import { useId } from 'react';

import { useActiveHousehold } from '../../households/use-active-household';
import { useHouseholdMonthlySummary } from '../../households/use-household-monthly-summary';
import { selectMonthlySummaryChart } from '../../households/select-monthly-summary';
import { ApiError } from '../../lib/api-error';
import { ErrorNotice } from '../error-notice';
import { MonthlyEvolutionRow } from './monthly-evolution-row';

function MonthlyEvolutionSkeleton({ titleId }: { titleId: string }) {
  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 id={titleId} className="text-sm font-medium text-ink-muted">
        Evolução mensal
      </h2>
      <p role="status" className="sr-only">
        Carregando evolução mensal...
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
      </div>
    </section>
  );
}

function resolveMonthlyEvolutionErrorMessage(error: unknown): {
  title: string;
  description: string;
} {
  if (error instanceof ApiError && error.status === 403) {
    return {
      title: 'Não foi possível carregar os dados desta família.',
      description: 'Verifique se você ainda faz parte dela ou tente novamente.',
    };
  }

  return {
    title: 'Não foi possível carregar a evolução mensal agora.',
    description: 'Tente novamente em instantes.',
  };
}

export function MonthlyEvolution() {
  const titleId = useId();
  const descriptionId = useId();
  const { householdsQuery, activeHousehold } = useActiveHousehold();
  const monthlyQuery = useHouseholdMonthlySummary(activeHousehold?.id);

  if (householdsQuery.isPending || (activeHousehold !== undefined && monthlyQuery.isPending)) {
    return <MonthlyEvolutionSkeleton titleId={titleId} />;
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
    return null;
  }

  if (monthlyQuery.isError) {
    const { title, description } = resolveMonthlyEvolutionErrorMessage(monthlyQuery.error);

    return (
      <ErrorNotice title={title} description={description} onRetry={() => monthlyQuery.refetch()} />
    );
  }

  if (!monthlyQuery.data) {
    return null;
  }

  const items = selectMonthlySummaryChart(monthlyQuery.data);
  const hasNoMovement = items.every(
    (item) => item.totalIncome === '0.00' && item.totalExpense === '0.00',
  );

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line/15 bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-sm font-medium text-ink-muted">
          Evolução mensal
        </h2>
        <p className="text-xs text-ink-muted">Últimos 6 meses</p>
      </div>
      <p id={descriptionId} className="sr-only">
        Receitas, despesas e saldo de cada um dos últimos seis meses, do mais antigo ao mais
        recente.
      </p>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-income" />
          Receitas
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-expense" />
          Despesas
        </span>
      </div>

      {hasNoMovement ? (
        <p className="mt-3 text-sm text-ink-muted">
          Nenhuma movimentação registrada nos últimos 6 meses.
        </p>
      ) : null}

      <ul aria-describedby={descriptionId} className="mt-4 flex flex-col gap-4">
        {items.map((item) => (
          <MonthlyEvolutionRow key={item.month} item={item} />
        ))}
      </ul>
    </section>
  );
}
