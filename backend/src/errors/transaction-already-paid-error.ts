export class TransactionAlreadyPaidError extends Error {
  constructor() {
    super('Transaction is already paid');
    this.name = 'TransactionAlreadyPaidError';
  }
}
