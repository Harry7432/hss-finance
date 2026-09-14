export class RecurringTransactionNotFoundError extends Error {
  constructor() {
    super('Recurring transaction not found');
    this.name = 'RecurringTransactionNotFoundError';
  }
}
