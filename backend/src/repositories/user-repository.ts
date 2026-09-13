import type { Repository } from 'typeorm';

import { UserEntity } from '../database/entities/user.entity.js';
import { EmailAlreadyExistsError } from '../errors/email-already-exists-error.js';

const UNIQUE_VIOLATION_CODE = '23505';
const USERS_EMAIL_CONSTRAINT = 'uq_users_email';

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
}

export interface UserRepository {
  create(data: CreateUserData): Promise<UserEntity>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (!isRecord(error) || !isRecord(error.driverError)) {
    return false;
  }

  return (
    error.driverError.code === UNIQUE_VIOLATION_CODE &&
    error.driverError.constraint === USERS_EMAIL_CONSTRAINT
  );
}

export class TypeOrmUserRepository implements UserRepository {
  constructor(private readonly repository: Repository<UserEntity>) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ email });
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ id });
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    const user = this.repository.create(data);

    try {
      return await this.repository.save(user);
    } catch (error: unknown) {
      if (isEmailUniqueViolation(error)) {
        throw new EmailAlreadyExistsError();
      }

      throw error;
    }
  }
}
