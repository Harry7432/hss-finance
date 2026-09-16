import { describe, expect, it } from 'vitest';

import type { CategorySummaryEntry } from './category-summary-api';
import { selectCategorySummary } from './select-category-summary';

function entry(overrides: Partial<CategorySummaryEntry> & { categoryName: string }) {
  return {
    categoryId: null,
    totalExpense: '0.00',
    ...overrides,
  };
}

describe('selectCategorySummary', () => {
  it('returns an empty list when there are no expenses', () => {
    expect(selectCategorySummary([])).toEqual([]);
  });

  it('keeps backend ordering (largest first) without re-sorting', () => {
    const entries = [
      entry({ categoryId: '1', categoryName: 'Mercado', totalExpense: '300.00' }),
      entry({ categoryId: '2', categoryName: 'Transporte', totalExpense: '100.00' }),
    ];

    const result = selectCategorySummary(entries);

    expect(result.map((item) => item.categoryName)).toEqual(['Mercado', 'Transporte']);
  });

  it('computes each category share as a percentage of the total', () => {
    const entries = [
      entry({ categoryId: '1', categoryName: 'Mercado', totalExpense: '2000.00' }),
      entry({ categoryId: '2', categoryName: 'Transporte', totalExpense: '1000.00' }),
    ];

    const result = selectCategorySummary(entries);

    expect(result).toEqual([
      expect.objectContaining({ categoryName: 'Mercado', percentage: '66.67' }),
      expect.objectContaining({ categoryName: 'Transporte', percentage: '33.33' }),
    ]);
  });

  it('assigns 100.00 to the only category', () => {
    const entries = [entry({ categoryId: '1', categoryName: 'Mercado', totalExpense: '50.00' })];

    const result = selectCategorySummary(entries);

    expect(result[0]?.percentage).toBe('100.00');
  });

  it('does not divide by zero when every category has a zero total', () => {
    const entries = [entry({ categoryId: '1', categoryName: 'Mercado', totalExpense: '0.00' })];

    const result = selectCategorySummary(entries);

    expect(result[0]?.percentage).toBe('0.00');
  });

  it('keeps a real "Sem categoria" row distinct from the synthetic "Outros" row', () => {
    const entries = [
      entry({ categoryId: null, categoryName: 'Sem categoria', totalExpense: '10.00' }),
    ];

    const result = selectCategorySummary(entries);

    expect(result).toEqual([
      expect.objectContaining({ categoryName: 'Sem categoria', isOthers: false }),
    ]);
  });

  it('keeps every category as its own row when at or under the display limit', () => {
    const entries = Array.from({ length: 5 }, (_unused, index) =>
      entry({
        categoryId: String(index),
        categoryName: `Categoria ${index}`,
        totalExpense: '10.00',
      }),
    );

    const result = selectCategorySummary(entries);

    expect(result).toHaveLength(5);
    expect(result.every((item) => !item.isOthers)).toBe(true);
  });

  it('collapses categories beyond the display limit into a single "Outros" row', () => {
    const entries = Array.from({ length: 7 }, (_unused, index) =>
      entry({
        categoryId: String(index),
        categoryName: `Categoria ${index}`,
        totalExpense: '10.00',
      }),
    );

    const result = selectCategorySummary(entries, 5);

    expect(result).toHaveLength(6);
    expect(result[5]).toEqual(
      expect.objectContaining({ categoryName: 'Outros', totalExpense: '20.00', isOthers: true }),
    );
  });

  it('computes the "Outros" percentage as a share of the full period total, not just the shown rows', () => {
    const entries = [
      entry({ categoryId: '1', categoryName: 'A', totalExpense: '10.00' }),
      entry({ categoryId: '2', categoryName: 'B', totalExpense: '10.00' }),
      entry({ categoryId: '3', categoryName: 'C', totalExpense: '10.00' }),
      entry({ categoryId: '4', categoryName: 'D', totalExpense: '10.00' }),
      entry({ categoryId: '5', categoryName: 'E', totalExpense: '10.00' }),
      entry({ categoryId: '6', categoryName: 'F', totalExpense: '30.00' }),
      entry({ categoryId: '7', categoryName: 'G', totalExpense: '20.00' }),
    ];

    const result = selectCategorySummary(entries, 5);
    const others = result.find((item) => item.isOthers);

    expect(others).toEqual(expect.objectContaining({ totalExpense: '50.00', percentage: '50.00' }));
  });

  it('preserves decimal precision in percentages without floating-point drift', () => {
    const entries = [
      entry({ categoryId: '1', categoryName: 'A', totalExpense: '1000.00' }),
      entry({ categoryId: '2', categoryName: 'B', totalExpense: '2000.00' }),
    ];

    const result = selectCategorySummary(entries);

    expect(result.map((item) => item.percentage)).toEqual(['33.33', '66.67']);
  });
});
