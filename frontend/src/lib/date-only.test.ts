import { describe, expect, it } from 'vitest';

import {
  formatDateOnlyPtBR,
  getCurrentMonthRangeInSaoPaulo,
  getTodayInSaoPaulo,
} from './date-only';

describe('formatDateOnlyPtBR', () => {
  it('formats a date-only string as DD/MM/YYYY without using Date parsing', () => {
    expect(formatDateOnlyPtBR('2026-09-20')).toBe('20/09/2026');
  });

  it('does not shift the day near a UTC boundary (no new Date(dateOnly) round trip)', () => {
    expect(formatDateOnlyPtBR('2026-01-01')).toBe('01/01/2026');
    expect(formatDateOnlyPtBR('2026-12-31')).toBe('31/12/2026');
  });

  it('returns the input unchanged when it is not a valid date-only string', () => {
    expect(formatDateOnlyPtBR('not-a-date')).toBe('not-a-date');
  });
});

describe('getTodayInSaoPaulo', () => {
  it('returns the calendar date in America/Sao_Paulo as YYYY-MM-DD', () => {
    const referenceDate = new Date('2026-09-15T02:30:00.000Z');

    expect(getTodayInSaoPaulo(referenceDate)).toBe('2026-09-14');
  });

  it('matches the UTC date when the time is well within the Brazilian daytime', () => {
    const referenceDate = new Date('2026-09-15T15:00:00.000Z');

    expect(getTodayInSaoPaulo(referenceDate)).toBe('2026-09-15');
  });
});

describe('getCurrentMonthRangeInSaoPaulo', () => {
  it('returns the first and last day of the current month in São Paulo', () => {
    const referenceDate = new Date('2026-09-15T15:00:00.000Z');

    expect(getCurrentMonthRangeInSaoPaulo(referenceDate)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      label: 'setembro de 2026',
    });
  });

  it('does not shift the month near a UTC day boundary (anchored to São Paulo, not UTC)', () => {
    // 2026-10-01T02:30:00Z is still 2026-09-30 in America/Sao_Paulo.
    const referenceDate = new Date('2026-10-01T02:30:00.000Z');

    expect(getCurrentMonthRangeInSaoPaulo(referenceDate).endDate).toBe('2026-09-30');
  });

  it('resolves February in a leap year to 29 days', () => {
    const referenceDate = new Date('2028-02-10T15:00:00.000Z');

    expect(getCurrentMonthRangeInSaoPaulo(referenceDate)).toEqual({
      startDate: '2028-02-01',
      endDate: '2028-02-29',
      label: 'fevereiro de 2028',
    });
  });

  it('resolves February in a non-leap year to 28 days', () => {
    const referenceDate = new Date('2026-02-10T15:00:00.000Z');

    expect(getCurrentMonthRangeInSaoPaulo(referenceDate).endDate).toBe('2026-02-28');
  });

  it('resolves December to 31 days', () => {
    const referenceDate = new Date('2026-12-15T15:00:00.000Z');

    expect(getCurrentMonthRangeInSaoPaulo(referenceDate)).toEqual({
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      label: 'dezembro de 2026',
    });
  });
});
