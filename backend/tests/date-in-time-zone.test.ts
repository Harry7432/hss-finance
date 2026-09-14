import { getDateInTimeZone } from '../src/utils/date-in-time-zone.js';

describe('getDateInTimeZone', () => {
  it('returns the civil date in America/Sao_Paulo by default', () => {
    expect(getDateInTimeZone(new Date('2026-09-13T15:00:00.000Z'))).toBe('2026-09-13');
  });

  it('keeps the previous Sao Paulo day after UTC has crossed midnight', () => {
    expect(getDateInTimeZone(new Date('2026-09-14T01:30:00.000Z'))).toBe('2026-09-13');
  });
});
