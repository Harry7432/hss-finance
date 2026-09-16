import { describe, expect, it } from 'vitest';

import { formatDateOnlyPtBR, getTodayInSaoPaulo } from './date-only';

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
