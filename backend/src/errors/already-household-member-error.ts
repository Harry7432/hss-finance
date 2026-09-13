export class AlreadyHouseholdMemberError extends Error {
  constructor() {
    super('User is already a household member');
    this.name = 'AlreadyHouseholdMemberError';
  }
}
