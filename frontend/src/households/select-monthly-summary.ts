import type { MonthlySummaryEntry } from './monthly-summary-api';

export interface MonthlySummaryChartItem {
  month: string;
  label: string;
  totalIncome: string;
  totalExpense: string;
  balance: string;
  incomeBarPercentage: number;
  expenseBarPercentage: number;
}

const SHORT_MONTH_LABELS_PT_BR = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** Formats a "YYYY-MM" month key as pt-BR, e.g. "2026-04" -> "abr/26". */
export function formatMonthKeyPtBR(monthKey: string): string {
  const [yearText = '', monthText = ''] = monthKey.split('-');
  const monthIndex = Number(monthText) - 1;
  const label = SHORT_MONTH_LABELS_PT_BR[monthIndex] ?? monthText;

  return `${label}/${yearText.slice(-2)}`;
}

function amountToCents(amount: string): bigint {
  const isNegative = amount.startsWith('-');
  const digits = isNegative ? amount.slice(1) : amount;
  const [integer, fraction = '00'] = digits.split('.');
  const cents = BigInt(`${integer}${fraction.padEnd(2, '0')}`);

  return isNegative ? -cents : cents;
}

function absoluteCents(cents: bigint): bigint {
  return cents < 0n ? -cents : cents;
}

/**
 * Builds the "Evolução mensal" chart rows: each month's income/expense bars
 * are scaled (via integer bigint division, never floating-point) against the
 * single largest income or expense across the whole window, so bar lengths
 * stay comparable month to month.
 */
export function selectMonthlySummaryChart(
  entries: MonthlySummaryEntry[],
): MonthlySummaryChartItem[] {
  const maxCents = entries.reduce((max, entry) => {
    const incomeCents = absoluteCents(amountToCents(entry.totalIncome));
    const expenseCents = absoluteCents(amountToCents(entry.totalExpense));
    const localMax = incomeCents > expenseCents ? incomeCents : expenseCents;

    return localMax > max ? localMax : max;
  }, 0n);

  return entries.map((entry) => {
    const incomeCents = absoluteCents(amountToCents(entry.totalIncome));
    const expenseCents = absoluteCents(amountToCents(entry.totalExpense));

    return {
      month: entry.month,
      label: formatMonthKeyPtBR(entry.month),
      totalIncome: entry.totalIncome,
      totalExpense: entry.totalExpense,
      balance: entry.balance,
      incomeBarPercentage: maxCents === 0n ? 0 : Number((incomeCents * 100n) / maxCents),
      expenseBarPercentage: maxCents === 0n ? 0 : Number((expenseCents * 100n) / maxCents),
    };
  });
}
