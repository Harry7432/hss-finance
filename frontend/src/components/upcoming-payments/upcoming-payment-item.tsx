import type { UpcomingPayment } from '../../households/select-upcoming-payments';
import { cn } from '../../lib/cn';
import { formatCurrencyBRL } from '../../lib/currency';
import { formatDateOnlyPtBR } from '../../lib/date-only';

const STATE_LABEL: Record<UpcomingPayment['state'], string> = {
  overdue: 'Vencida',
  today: 'Vence hoje',
  future: 'Vence em',
};

const STATE_TONE_CLASS: Record<UpcomingPayment['state'], string> = {
  overdue: 'text-expense',
  today: 'text-pending',
  future: 'text-ink-muted',
};

export function UpcomingPaymentItem({ payment }: { payment: UpcomingPayment }) {
  const stateLabel =
    payment.state === 'future'
      ? `${STATE_LABEL.future} ${formatDateOnlyPtBR(payment.dueDate)}`
      : `${STATE_LABEL[payment.state]} · ${formatDateOnlyPtBR(payment.dueDate)}`;

  return (
    <li className="flex flex-col gap-1 rounded-xl border border-line/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{payment.description ?? 'Sem descrição'}</p>
        <p className={cn('text-sm', STATE_TONE_CLASS[payment.state])}>{stateLabel}</p>
      </div>
      <p
        className={cn(
          'shrink-0 text-right font-semibold tabular-nums',
          payment.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {formatCurrencyBRL(payment.amount)}
      </p>
    </li>
  );
}
