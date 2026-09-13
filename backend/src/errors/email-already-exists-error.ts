export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'EmailAlreadyExistsError';
  }
}
