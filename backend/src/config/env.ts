import 'dotenv/config';

const DEFAULT_PORT = 3000;
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';
const DEFAULT_DATABASE_URL = 'postgresql://hss_finance:hss_finance_dev@localhost:5433/hss_finance';
const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (!NODE_ENVIRONMENTS.includes(value as NodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  return value as NodeEnvironment;
}

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

export function parseFrontendOrigin(value: string | undefined, requireHttps = false): string {
  const origin = value ?? DEFAULT_FRONTEND_ORIGIN;

  try {
    const url = new URL(origin);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      (requireHttps && url.protocol !== 'https:') ||
      url.origin !== origin ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== '/' ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('FRONTEND_ORIGIN must be a valid HTTP or HTTPS origin without a path.');
  }

  return origin;
}

const nodeEnvironment = parseNodeEnvironment(process.env.NODE_ENV);

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
  nodeEnvironment,
  port: parsePort(process.env.PORT),
  frontendOrigin: parseFrontendOrigin(
    process.env.FRONTEND_ORIGIN ?? process.env.CORS_ORIGIN,
    nodeEnvironment === 'production',
  ),
  databaseUrl: parseDatabaseUrl(process.env.DATABASE_URL),
  databaseLogging: parseBoolean('DATABASE_LOGGING', process.env.DATABASE_LOGGING, false),
  secureCookies: nodeEnvironment === 'production',
});
