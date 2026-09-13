import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { jwtConfig } from './config/jwt.js';
import { databaseReadiness, type DatabaseReadiness } from './database/database-readiness.js';
import { appDataSource } from './database/data-source.js';
import { UserEntity } from './database/entities/user.entity.js';
import { errorHandler } from './middleware/error-handler.js';
import { TypeOrmUserRepository, type UserRepository } from './repositories/user-repository.js';
import { createApiRouter } from './routes/index.js';

const userRepository = new TypeOrmUserRepository(appDataSource.getRepository(UserEntity));
const jwtSecret = Buffer.from(jwtConfig.secret, 'base64');

export function createApp(
  database: DatabaseReadiness = databaseReadiness,
  users: UserRepository = userRepository,
  tokenSecret: Uint8Array = jwtSecret,
): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  app.use('/api', createApiRouter(database, users, tokenSecret));
  app.use(errorHandler);

  return app;
}

export const app = createApp();
