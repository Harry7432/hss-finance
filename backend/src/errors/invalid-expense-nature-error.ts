export class InvalidExpenseNatureError extends Error {
  constructor() {
    super('expenseNature is only allowed for expense transactions');
    this.name = 'InvalidExpenseNatureError';
  }
}
