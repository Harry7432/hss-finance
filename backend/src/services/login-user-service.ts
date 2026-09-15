import { verify } from 'argon2';
import { SignJWT } from 'jose';

import { ACCESS_TOKEN_EXPIRATION_SECONDS } from '../config/session.js';
import { InvalidCredentialsError } from '../errors/invalid-credentials-error.js';
import type { UserRepository } from '../repositories/user-repository.js';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$ZutKfsOZ3OTW4Xq0b7pCgQ$mp+a6VdLtNkWJJl26rMZe17n8QH5il4aDT3UiqmUftE';

export type PasswordVerifier = (passwordHash: string, password: string) => Promise<boolean>;

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface LoginUserResult {
  user: {
    id: string;
    name: string;
    email: string;
  };
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export class LoginUserService {
  constructor(
    private readonly users: UserRepository,
    private readonly jwtSecret: Uint8Array,
    private readonly verifyPassword: PasswordVerifier = verify,
  ) {}

  async execute(input: LoginUserInput): Promise<LoginUserResult> {
    const user = await this.users.findByEmail(input.email);
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.verifyPassword(passwordHash, input.password);

    if (!user || !passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const accessToken = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_EXPIRATION_SECONDS}s`)
      .sign(this.jwtSecret);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_EXPIRATION_SECONDS,
    };
  }
}
