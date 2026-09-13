import { argon2id, hash } from 'argon2';

import { EmailAlreadyExistsError } from '../errors/email-already-exists-error.js';
import type { UserRepository } from '../repositories/user-repository.js';

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export interface RegisterUserInput {
  email: string;
  name: string;
  password: string;
}

export interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export class RegisterUserService {
  constructor(private readonly users: UserRepository) {}

  async execute(input: RegisterUserInput): Promise<RegisteredUser> {
    const existingUser = await this.users.findByEmail(input.email);

    if (existingUser) {
      throw new EmailAlreadyExistsError();
    }

    const passwordHash = await hash(input.password, ARGON2_OPTIONS);
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }
}
