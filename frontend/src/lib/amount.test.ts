import { describe, expect, it } from 'vitest';

import { parseAmountInput } from './amount';

describe('parseAmountInput', () => {
  it('accepts a plain integer', () => {
    expect(parseAmountInput('150')).toBe('150.00');
  });

  it('accepts a dot as the decimal separator', () => {
    expect(parseAmountInput('150.90')).toBe('150.90');
  });

  it('accepts a comma as the decimal separator (pt-BR)', () => {
    expect(parseAmountInput('150,90')).toBe('150.90');
  });

  it('pads a single decimal digit to two', () => {
    expect(parseAmountInput('10,5')).toBe('10.50');
  });

  it('accepts a dot as the pt-BR thousands separator combined with a comma decimal', () => {
    expect(parseAmountInput('1.234,56')).toBe('1234.56');
  });

  it('strips leading zeros from the integer part', () => {
    expect(parseAmountInput('007,50')).toBe('7.50');
  });

  it('trims surrounding whitespace', () => {
    expect(parseAmountInput('  150,90  ')).toBe('150.90');
  });

  it('accepts the maximum 12-digit integer part', () => {
    expect(parseAmountInput('999999999999,99')).toBe('999999999999.99');
  });

  it('rejects an integer part longer than 12 digits', () => {
    expect(parseAmountInput('9999999999999')).toBeNull();
  });

  it('rejects zero', () => {
    expect(parseAmountInput('0')).toBeNull();
    expect(parseAmountInput('0,00')).toBeNull();
    expect(parseAmountInput('0.00')).toBeNull();
  });

  it('rejects a negative amount', () => {
    expect(parseAmountInput('-10')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseAmountInput('abc')).toBeNull();
  });

  it('rejects empty or blank input', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('   ')).toBeNull();
  });

  it('rejects exponential notation', () => {
    expect(parseAmountInput('1e3')).toBeNull();
  });

  it('rejects more than two decimal digits', () => {
    expect(parseAmountInput('10,123')).toBeNull();
  });

  it('rejects an ambiguous dot-only value with more than two fraction digits instead of guessing', () => {
    expect(parseAmountInput('1.234')).toBeNull();
  });

  it('rejects multiple commas', () => {
    expect(parseAmountInput('10,50,00')).toBeNull();
  });

  it('rejects multiple dots without a comma', () => {
    expect(parseAmountInput('1.234.567')).toBeNull();
  });

  it('rejects a comma appearing before the last dot', () => {
    expect(parseAmountInput('1,234.56')).toBeNull();
  });
});
