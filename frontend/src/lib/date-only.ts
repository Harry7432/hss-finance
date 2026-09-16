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
