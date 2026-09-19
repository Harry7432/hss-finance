import { Link } from 'react-router';

import type { TransactionRecord } from '../../households/transaction-api';
import type { TransactionRow, TransactionRowState } from '../../households/select-transactions';
import { cn } from '../../lib/cn';
import { formatCurrencyBRL } from '../../lib/currency';
import { formatDateOnlyPtBR } from '../../lib/date-only';

const TYPE_LABEL: Record<TransactionRecord['type'], string> = {
  income: 'Receita',
  expense: 'Despesa',
};

const STATE_LABEL: Record<TransactionRowState, string> = {
  paid: 'Pago',
  pending: 'Pendente',
  overdue: 'Vencida',
};

const STATE_TONE_CLASS: Record<TransactionRowState, string> = {
  paid: 'text-income',
  pending: 'text-pending',
  overdue: 'text-expense',
};

function amountToneClass(type: TransactionRecord['type']): string {
  return type === 'income' ? 'text-income' : 'text-expense';
}

export function TransactionsList({ rows }: { rows: TransactionRow[] }) {
  return (
    <>
      <table className="hidden w-full text-left lg:table">
        <thead>
          <tr className="border-b border-line/15 text-xs font-medium uppercase tracking-wide text-ink-muted">
            <th scope="col" className="py-2 pr-4">
              Descrição
            </th>
            <th scope="col" className="py-2 pr-4">
              Tipo
            </th>
            <th scope="col" className="py-2 pr-4">
              Categoria
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              Valor
            </th>
            <th scope="col" className="py-2 pr-4">
              Data
            </th>
            <th scope="col" className="py-2 pr-4">
              Vencimento
            </th>
            <th scope="col" className="py-2 pr-4">
              Status
            </th>
            <th scope="col" className="py-2">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line/10 last:border-0">
              <td className="max-w-64 truncate py-3 pr-4 text-ink">
                {row.description ?? 'Sem descrição'}
              </td>
              <td className="py-3 pr-4 text-ink-muted">{TYPE_LABEL[row.type]}</td>
              <td className="py-3 pr-4 text-ink-muted">{row.categoryName}</td>
              <td
                className={cn(
                  'py-3 pr-4 text-right font-medium tabular-nums',
                  amountToneClass(row.type),
                )}
              >
                {formatCurrencyBRL(row.amount)}
              </td>
              <td className="py-3 pr-4 text-ink-muted">
                {formatDateOnlyPtBR(row.transactionDate)}
              </td>
              <td className="py-3 pr-4 text-ink-muted">
                {row.dueDate ? formatDateOnlyPtBR(row.dueDate) : '—'}
              </td>
              <td className={cn('py-3 pr-4 font-medium', STATE_TONE_CLASS[row.state])}>
                {STATE_LABEL[row.state]}
              </td>
              <td className="py-3 text-right">
                {row.status === 'pending' ? (
                  <Link
                    to={`/app/transactions/${row.id}/pay`}
                    className="whitespace-nowrap text-sm font-medium text-brand-strong hover:underline"
                  >
                    Pagar com Asaas
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul aria-label="Lançamentos" className="flex flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-line/15 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate font-medium text-ink">
                {row.description ?? 'Sem descrição'}
              </p>
              <p className={cn('shrink-0 font-semibold tabular-nums', amountToneClass(row.type))}>
                {formatCurrencyBRL(row.amount)}
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-ink-muted">
              <div>
                <dt className="sr-only">Tipo</dt>
                <dd>{TYPE_LABEL[row.type]}</dd>
              </div>
              <div>
                <dt className="sr-only">Status</dt>
                <dd className={cn('font-medium', STATE_TONE_CLASS[row.state])}>
                  {STATE_LABEL[row.state]}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Categoria</dt>
                <dd className="truncate">{row.categoryName}</dd>
              </div>
              <div>
                <dt className="sr-only">Data</dt>
                <dd>{formatDateOnlyPtBR(row.transactionDate)}</dd>
              </div>
            </dl>
            {row.status === 'pending' ? (
              <Link
                to={`/app/transactions/${row.id}/pay`}
                className="mt-3 inline-block text-sm font-medium text-brand-strong hover:underline"
              >
                Pagar com Asaas
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
