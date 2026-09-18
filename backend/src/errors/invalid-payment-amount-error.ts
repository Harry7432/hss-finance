export class InvalidPaymentAmountError extends Error {
  constructor() {
    super('Payment amount does not match the transaction amount');
    this.name = 'InvalidPaymentAmountError';
  }
}
