import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { UserRepository } from '../repositories/user-repository.js';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export class GetCurrentUserService {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<CurrentUser> {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new UnauthorizedError();
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    };
  }
}
