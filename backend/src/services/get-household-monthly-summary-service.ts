import type {
  HouseholdMonthlySummaryEntry,
  TransactionRepository,
} from '../repositories/transaction-repository.js';
import { getDateInTimeZone } from '../utils/date-in-time-zone.js';
import type { TodayProvider } from './list-transactions-service.js';

export const MONTHLY_SUMMARY_WINDOW_SIZE = 6;

/**
 * Builds the last `MONTHLY_SUMMARY_WINDOW_SIZE` civil months (YYYY-MM),
 * ascending, ending with the month of `today` (a YYYY-MM-DD date). Pure
 * integer arithmetic on a zero-based month index avoids `Date` entirely, so
 * there is no UTC-offset drift risk.
 */
export function computeMonthlySummaryWindow(
  today: string,
  windowSize: number = MONTHLY_SUMMARY_WINDOW_SIZE,
): string[] {
  const [yearText, monthText] = today.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const currentMonthIndex = year * 12 + (month - 1);

  return Array.from({ length: windowSize }, (_, position) => {
    const monthIndex = currentMonthIndex - (windowSize - 1 - position);
    const targetYear = Math.floor(monthIndex / 12);
    const targetMonth = (monthIndex % 12) + 1;

    return `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  });
}

export class GetHouseholdMonthlySummaryService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly todayProvider: TodayProvider = getDateInTimeZone,
  ) {}

  async execute(householdId: string, requesterId: string): Promise<HouseholdMonthlySummaryEntry[]> {
    const months = computeMonthlySummaryWindow(this.todayProvider());

    return this.transactions.getMonthlySummaryAsMember({ householdId, requesterId, months });
  }
}
