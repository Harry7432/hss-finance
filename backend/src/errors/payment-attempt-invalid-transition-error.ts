export class PaymentAttemptInvalidTransitionError extends Error {
  constructor() {
    super('Payment attempt is not in a state that allows this transition');
    this.name = 'PaymentAttemptInvalidTransitionError';
  }
}
