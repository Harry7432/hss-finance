import 'dotenv/config';

const DEFAULT_PORT = 3000;
const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';
const DEFAULT_DATABASE_URL = 'postgresql://hss_finance:hss_finance_dev@localhost:5433/hss_finance';

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
}

function parseCorsOrigin(value: string | undefined): string {
  const origin = value ?? DEFAULT_CORS_ORIGIN;

  try {
    const url = new URL(origin);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new Error('CORS_ORIGIN must be a valid HTTP or HTTPS origin.');
  }

  return origin;
}

function parseDatabaseUrl(value: string | undefined): string {
  const databaseUrl = value ?? DEFAULT_DATABASE_URL;

  try {
    const url = new URL(databaseUrl);
    const hasDatabaseName = url.pathname.length > 1;

    if (
      (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
      url.hostname.length === 0 ||
      url.username.length === 0 ||
      url.password.length === 0 ||
      !hasDatabaseName
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  return databaseUrl;
}

function parseBoolean(name: string, value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`${name} must be either true or false.`);
}

export const env = Object.freeze({
  port: parsePort(process.env.PORT),
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  databaseUrl: parseDatabaseUrl(process.env.DATABASE_URL),
  databaseLogging: parseBoolean('DATABASE_LOGGING', process.env.DATABASE_LOGGING, false),
});
