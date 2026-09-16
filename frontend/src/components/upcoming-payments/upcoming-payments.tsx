import { useId } from 'react';

import { selectUpcomingPayments } from '../../households/select-upcoming-payments';
import { useActiveHousehold } from '../../households/use-active-household';
import { useUpcomingTransactions } from '../../households/use-upcoming-transactions';
import { ApiError } from '../../lib/api-error';
import { getTodayInSaoPaulo } from '../../lib/date-only';
import { ErrorNotice } from '../error-notice';
import { UpcomingPaymentItem } from './upcoming-payment-item';

function UpcomingPaymentsSkeleton({ titleId }: { titleId: string }) {
  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 id={titleId} className="text-sm font-medium text-ink-muted">
        Próximos vencimentos
      </h2>
      <p role="status" className="sr-only">
        Carregando próximos vencimentos...
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <div aria-hidden="true" className="h-14 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-14 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-14 animate-pulse rounded-xl bg-page" />
      </div>
    </section>
  );
}

function resolveUpcomingErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 403) {
    return {
      title: 'Não foi possível carregar as contas desta família.',
      description: 'Verifique se você ainda faz parte dela ou tente novamente.',
    };
  }

  return {
    title: 'Não foi possível carregar os próximos vencimentos agora.',
    description: 'Tente novamente em instantes.',
  };
}

export function UpcomingPayments() {
  const titleId = useId();
  const { householdsQuery, activeHousehold } = useActiveHousehold();
  const upcomingQuery = useUpcomingTransactions(activeHousehold?.id);

  if (householdsQuery.isPending || (activeHousehold !== undefined && upcomingQuery.isPending)) {
    return <UpcomingPaymentsSkeleton titleId={titleId} />;
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

  if (upcomingQuery.isError) {
    const { title, description } = resolveUpcomingErrorMessage(upcomingQuery.error);

    return (
      <ErrorNotice
        title={title}
        description={description}
        onRetry={() => upcomingQuery.refetch()}
      />
    );
  }

  if (!upcomingQuery.data) {
    return null;
  }

  const today = getTodayInSaoPaulo();
  const payments = selectUpcomingPayments(upcomingQuery.data, today);

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 id={titleId} className="text-sm font-medium text-ink-muted">
        Próximos vencimentos
      </h2>

      {payments.length === 0 ? (
        <p className="mt-4 text-ink-muted">Nenhuma conta próxima do vencimento.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {payments.map((payment) => (
            <UpcomingPaymentItem key={payment.id} payment={payment} />
          ))}
        </ul>
      )}
    </section>
  );
}
