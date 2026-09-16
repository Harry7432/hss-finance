const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats a date-only string (YYYY-MM-DD, as returned by the backend for
 * dueDate/transactionDate) as pt-BR (DD/MM/YYYY) via plain string
 * rearrangement. Never parse a date-only value with `new Date(...)`: that
 * interprets it as UTC midnight and can shift a day in negative-offset
 * timezones once displayed locally.
 */
export function formatDateOnlyPtBR(dateOnly: string): string {
  const match = DATE_ONLY_PATTERN.exec(dateOnly);

  if (!match) {
    return dateOnly;
  }

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * Today's calendar date in America/Sao_Paulo, matching the backend's own
 * `getDateInTimeZone` reference used to classify overdue transactions. Used
 * only to label an already pending transaction as due "today" vs a future
 * date for display — it never decides pending/overdue status, which is
 * always the backend's own classification.
 */
export function getTodayInSaoPaulo(referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Could not format date in time zone');
  }

  return `${year}-${month}-${day}`;
}

const MONTH_LABELS_PT_BR = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export interface MonthRange {
  startDate: string;
  endDate: string;
  label: string;
}

/**
 * The current civil month in America/Sao_Paulo as a date-only range, anchored
 * to `getTodayInSaoPaulo` so it never drifts from the same reference the rest
 * of the dashboard uses. The last day of the month is computed with
 * `Date.UTC(year, month, 0)` — passing our 1-indexed month as UTC's 0-indexed
 * value lands on day 0 of "next month", i.e. the last day of the target
 * month — which is pure calendar arithmetic on integers, not a parse of a
 * date-only string, so it carries none of the UTC-midnight shift risk called
 * out above.
 */
export function getCurrentMonthRangeInSaoPaulo(referenceDate: Date = new Date()): MonthRange {
  const today = getTodayInSaoPaulo(referenceDate);
  const [yearText = '', monthText = ''] = today.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthLabel = MONTH_LABELS_PT_BR[month - 1] ?? monthText;

  return {
    startDate: `${yearText}-${monthText}-01`,
    endDate: `${yearText}-${monthText}-${String(daysInMonth).padStart(2, '0')}`,
    label: `${monthLabel} de ${yearText}`,
  };
}
