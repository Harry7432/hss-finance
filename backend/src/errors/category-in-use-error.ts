export class CategoryInUseError extends Error {
  constructor() {
    super('Category is in use');
    this.name = 'CategoryInUseError';
  }
}
