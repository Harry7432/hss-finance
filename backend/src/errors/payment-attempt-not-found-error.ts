export class PaymentAttemptNotFoundError extends Error {
  constructor() {
    super('Payment attempt not found');
    this.name = 'PaymentAttemptNotFoundError';
  }
}
