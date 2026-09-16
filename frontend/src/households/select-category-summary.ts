import type { CategorySummaryEntry } from './category-summary-api';

export const CATEGORY_SUMMARY_DISPLAY_LIMIT = 5;
export const OTHERS_CATEGORY_LABEL = 'Outros';

export interface CategorySummaryItem {
  categoryId: string | null;
  categoryName: string;
  totalExpense: string;
  percentage: string;
  isOthers: boolean;
}

function amountToCents(amount: string): bigint {
  const [integer, fraction = '00'] = amount.split('.');
  return BigInt(`${integer}${fraction.padEnd(2, '0')}`);
}

function centsToAmount(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/**
 * Mirrors the backend's computeExpenseSharePercentage (transaction-repository.ts):
 * scaled integer division with half-up rounding, so displayed percentages never
 * drift from what plain floating-point division would visibly round differently.
 */
function computeSharePercentage(entryCents: bigint, totalCents: bigint): string {
  if (totalCents === 0n) {
    return '0.00';
  }

  const scaledNumerator = entryCents * 10000n;
  const quotient = scaledNumerator / totalCents;
  const remainder = scaledNumerator % totalCents;
  const roundedHundredths = remainder * 2n >= totalCents ? quotient + 1n : quotient;
  const integerPart = roundedHundredths / 100n;
  const fractionPart = (roundedHundredths % 100n).toString().padStart(2, '0');

  return `${integerPart}.${fractionPart}`;
}

/**
 * Builds the "Gastos por categoria" list shown on the dashboard: the backend
 * already returns categories aggregated and ordered by totalExpense
 * descending, so the top N are simply the first N entries. Anything beyond
 * the limit is collapsed into a single "Outros" row rather than dropped, so
 * the displayed total always reconciles with the full period.
 */
export function selectCategorySummary(
  entries: CategorySummaryEntry[],
  limit: number = CATEGORY_SUMMARY_DISPLAY_LIMIT,
): CategorySummaryItem[] {
  const totalCents = entries.reduce((sum, entry) => sum + amountToCents(entry.totalExpense), 0n);
  const top = entries.slice(0, limit);
  const rest = entries.slice(limit);

  const items: CategorySummaryItem[] = top.map((entry) => {
    const cents = amountToCents(entry.totalExpense);

    return {
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      totalExpense: entry.totalExpense,
      percentage: computeSharePercentage(cents, totalCents),
      isOthers: false,
    };
  });

  if (rest.length > 0) {
    const restCents = rest.reduce((sum, entry) => sum + amountToCents(entry.totalExpense), 0n);

    items.push({
      categoryId: null,
      categoryName: OTHERS_CATEGORY_LABEL,
      totalExpense: centsToAmount(restCents),
      percentage: computeSharePercentage(restCents, totalCents),
      isOthers: true,
    });
  }

  return items;
}
