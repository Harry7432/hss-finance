import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { env } from '../config/env.js';

export const appDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  synchronize: false,
  logging: env.databaseLogging,
  entities: [],
  migrations: [],
  subscribers: [],
  connectTimeoutMS: 5_000,
  extra: {
    max: 10,
  },
});
