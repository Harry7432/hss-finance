import { formatCurrencyBRL } from '../../lib/currency';
import type { CategorySummaryItem } from '../../households/select-category-summary';

export function CategoryBarItem({ item }: { item: CategorySummaryItem }) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.categoryName}</span>
        <span className="whitespace-nowrap text-sm font-medium text-ink">
          {formatCurrencyBRL(item.totalExpense)}{' '}
          <span className="text-xs font-normal text-ink-muted">({item.percentage}%)</span>
        </span>
      </div>
      <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-page">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.min(Number(item.percentage), 100)}%` }}
        />
      </div>
    </li>
  );
}
