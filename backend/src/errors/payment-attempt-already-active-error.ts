export class PaymentAttemptAlreadyActiveError extends Error {
  constructor() {
    super('An active payment attempt already exists for this transaction and kind');
    this.name = 'PaymentAttemptAlreadyActiveError';
  }
}
