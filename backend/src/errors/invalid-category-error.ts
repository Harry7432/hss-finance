export class InvalidCategoryError extends Error {
  constructor() {
    super('Invalid category');
    this.name = 'InvalidCategoryError';
  }
}
