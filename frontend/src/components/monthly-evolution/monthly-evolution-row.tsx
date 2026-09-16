import { formatCurrencyBRL } from '../../lib/currency';
import type { MonthlySummaryChartItem } from '../../households/select-monthly-summary';

export function MonthlyEvolutionRow({ item }: { item: MonthlySummaryChartItem }) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium capitalize text-ink">{item.label}</span>
        <span className="whitespace-nowrap text-sm font-semibold text-ink">
          {formatCurrencyBRL(item.balance)}
        </span>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-page">
          <div
            className="h-full rounded-full bg-income"
            style={{ width: `${Math.min(item.incomeBarPercentage, 100)}%` }}
          />
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-page">
          <div
            className="h-full rounded-full bg-expense"
            style={{ width: `${Math.min(item.expenseBarPercentage, 100)}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
        <span>
          Receitas:{' '}
          <span className="font-medium text-income">{formatCurrencyBRL(item.totalIncome)}</span>
        </span>
        <span>
          Despesas:{' '}
          <span className="font-medium text-expense">{formatCurrencyBRL(item.totalExpense)}</span>
        </span>
      </div>
    </li>
  );
}
