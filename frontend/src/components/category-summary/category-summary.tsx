import { useId } from 'react';

import { useActiveHousehold } from '../../households/use-active-household';
import { useHouseholdCategorySummary } from '../../households/use-household-category-summary';
import { selectCategorySummary } from '../../households/select-category-summary';
import { ApiError } from '../../lib/api-error';
import { getCurrentMonthRangeInSaoPaulo } from '../../lib/date-only';
import { ErrorNotice } from '../error-notice';
import { CategoryBarItem } from './category-bar-item';

function CategorySummarySkeleton({ titleId }: { titleId: string }) {
  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 id={titleId} className="text-sm font-medium text-ink-muted">
        Gastos por categoria
      </h2>
      <p role="status" className="sr-only">
        Carregando gastos por categoria...
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <div aria-hidden="true" className="h-9 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-9 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-9 animate-pulse rounded-xl bg-page" />
      </div>
    </section>
  );
}

function resolveCategorySummaryErrorMessage(error: unknown): {
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
    title: 'Não foi possível carregar os gastos por categoria agora.',
    description: 'Tente novamente em instantes.',
  };
}

export function CategorySummary() {
  const titleId = useId();
  const { householdsQuery, activeHousehold } = useActiveHousehold();
  const { startDate, endDate, label } = getCurrentMonthRangeInSaoPaulo();
  const categoryQuery = useHouseholdCategorySummary(activeHousehold?.id, startDate, endDate);

  if (householdsQuery.isPending || (activeHousehold !== undefined && categoryQuery.isPending)) {
    return <CategorySummarySkeleton titleId={titleId} />;
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

  if (categoryQuery.isError) {
    const { title, description } = resolveCategorySummaryErrorMessage(categoryQuery.error);

    return (
      <ErrorNotice
        title={title}
        description={description}
        onRetry={() => categoryQuery.refetch()}
      />
    );
  }

  if (!categoryQuery.data) {
    return null;
  }

  const items = selectCategorySummary(categoryQuery.data);

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line/15 bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-sm font-medium text-ink-muted">
          Gastos por categoria
        </h2>
        <p className="text-xs capitalize text-ink-muted">{label}</p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-ink-muted">Nenhuma despesa registrada neste mês.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <CategoryBarItem
              key={item.isOthers ? 'others' : (item.categoryId ?? 'uncategorized')}
              item={item}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
