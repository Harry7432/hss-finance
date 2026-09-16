import { describe, expect, it } from 'vitest';

import type { MonthlySummaryEntry } from './monthly-summary-api';
import { formatMonthKeyPtBR, selectMonthlySummaryChart } from './select-monthly-summary';

function entry(overrides: Partial<MonthlySummaryEntry> & { month: string }): MonthlySummaryEntry {
  return {
    totalIncome: '0.00',
    totalExpense: '0.00',
    balance: '0.00',
    ...overrides,
  };
}

describe('formatMonthKeyPtBR', () => {
  it.each([
    ['2026-04', 'abr/26'],
    ['2026-01', 'jan/26'],
    ['2026-12', 'dez/26'],
    ['2026-09', 'set/26'],
  ])('formats %s as %s', (monthKey, expected) => {
    expect(formatMonthKeyPtBR(monthKey)).toBe(expected);
  });
});

describe('selectMonthlySummaryChart', () => {
  it('returns an empty list when there are no months', () => {
    expect(selectMonthlySummaryChart([])).toEqual([]);
  });

  it('keeps backend ordering (chronological) without re-sorting', () => {
    const entries = [
      entry({ month: '2026-04' }),
      entry({ month: '2026-05' }),
      entry({ month: '2026-06' }),
    ];

    const result = selectMonthlySummaryChart(entries);

    expect(result.map((item) => item.month)).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('scales each month bar against the largest income or expense in the whole window', () => {
    const entries = [
      entry({ month: '2026-04', totalIncome: '1000.00', totalExpense: '500.00' }),
      entry({ month: '2026-05', totalIncome: '250.00', totalExpense: '1000.00' }),
    ];

    const result = selectMonthlySummaryChart(entries);

    expect(result[0]).toEqual(
      expect.objectContaining({ incomeBarPercentage: 100, expenseBarPercentage: 50 }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({ incomeBarPercentage: 25, expenseBarPercentage: 100 }),
    );
  });

  it('does not divide by zero when every month has zero movement', () => {
    const entries = [entry({ month: '2026-04' }), entry({ month: '2026-05' })];

    const result = selectMonthlySummaryChart(entries);

    expect(result.every((item) => item.incomeBarPercentage === 0)).toBe(true);
    expect(result.every((item) => item.expenseBarPercentage === 0)).toBe(true);
  });

  it('preserves the original decimal string values for display', () => {
    const entries = [
      entry({ month: '2026-04', totalIncome: '999999999900.10', totalExpense: '0.07' }),
    ];

    const result = selectMonthlySummaryChart(entries);

    expect(result[0]).toEqual(
      expect.objectContaining({ totalIncome: '999999999900.10', totalExpense: '0.07' }),
    );
  });

  it('labels each month in pt-BR', () => {
    const entries = [entry({ month: '2026-04' })];

    const result = selectMonthlySummaryChart(entries);

    expect(result[0]?.label).toBe('abr/26');
  });
});
