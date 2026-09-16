import { useId } from 'react';

import { cn } from '../../lib/cn';

interface SummaryCardProps {
  title: string;
  value: string;
  tone?: 'income' | 'expense';
  emphasis?: boolean;
  className?: string;
}

export function SummaryCard({ title, value, tone, emphasis, className }: SummaryCardProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn('rounded-2xl border border-line/15 bg-surface p-6', className)}
    >
      <h2 id={titleId} className="text-sm font-medium text-ink-muted">
        {title}
      </h2>
      <p
        className={cn(
          'mt-2 font-semibold tracking-[-0.01em] text-ink',
          emphasis ? 'text-3xl sm:text-4xl' : 'text-2xl',
          tone === 'income' && 'text-income',
          tone === 'expense' && 'text-expense',
        )}
      >
        {value}
      </p>
    </section>
  );
}
