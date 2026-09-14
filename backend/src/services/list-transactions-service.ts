import type {
  ListTransactionsData,
  ListTransactionsResult,
  TransactionRepository,
} from '../repositories/transaction-repository.js';
import { getDateInTimeZone } from '../utils/date-in-time-zone.js';

export type ListTransactionsInput = Omit<
  ListTransactionsData,
  'householdId' | 'requesterId' | 'today'
>;

export type TodayProvider = () => string;

export class ListTransactionsService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly todayProvider: TodayProvider = getDateInTimeZone,
  ) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: ListTransactionsInput,
  ): Promise<ListTransactionsResult> {
    return this.transactions.listAsMember({
      householdId,
      requesterId,
      ...input,
      today: this.todayProvider(),
    });
  }
}
