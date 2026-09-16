import { describe, expect, it } from 'vitest';

import { formatCurrencyBRL } from './currency';

const NBSP = ' ';

describe('formatCurrencyBRL', () => {
  it('formats a positive amount as pt-BR BRL', () => {
    expect(formatCurrencyBRL('1234.56')).toBe(`R$${NBSP}1.234,56`);
  });

  it('formats a negative amount with a leading minus sign', () => {
    expect(formatCurrencyBRL('-500.00')).toBe(`-R$${NBSP}500,00`);
  });

  it('formats zero without a sign', () => {
    expect(formatCurrencyBRL('0.00')).toBe(`R$${NBSP}0,00`);
  });

  it('preserves large values without losing the integer grouping', () => {
    expect(formatCurrencyBRL('999999999900.30')).toBe(`R$${NBSP}999.999.999.900,30`);
  });

  it('falls back to zero for a non-numeric value instead of throwing', () => {
    expect(formatCurrencyBRL('not-a-number')).toBe(`R$${NBSP}0,00`);
  });
});
