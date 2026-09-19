import 'dotenv/config';

const DEFAULT_PORT = 3000;
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';
const DEFAULT_DATABASE_URL = 'postgresql://hss_finance:hss_finance_dev@localhost:5433/hss_finance';
const DEFAULT_PLUGGY_BASE_URL = 'https://api.pluggy.ai';
const DEFAULT_ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
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

export function parsePluggyBaseUrl(value: string | undefined): string {
  const baseUrl = value ?? DEFAULT_PLUGGY_BASE_URL;

  try {
    const url = new URL(baseUrl);

    if (
      url.protocol !== 'https:' ||
      url.origin !== baseUrl ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== '/' ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('PLUGGY_BASE_URL must be a valid HTTPS origin without a path.');
  }

  return baseUrl;
}

export function parseAsaasBaseUrl(value: string | undefined): string {
  // Fail-closed by design: this stage of the project only ever talks to the official
  // Asaas Sandbox. Rather than validating URL shape (protocol/host/path independently),
  // require an exact match against the Sandbox origin so no other host — including a
  // convincing lookalike such as "api-sandbox.asaas.com.evil.com" — is ever accepted.
  const baseUrl = value && value.length > 0 ? value : DEFAULT_ASAAS_BASE_URL;

  if (baseUrl !== DEFAULT_ASAAS_BASE_URL) {
    throw new Error(
      `ASAAS_BASE_URL must be exactly ${DEFAULT_ASAAS_BASE_URL} (Sandbox-only at this stage).`,
    );
  }

  return baseUrl;
}

function parseOptionalSecret(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
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
  // Not yet consumed by the app; the Pluggy provider isn't wired in (see Slice 6.4).
  pluggyClientId: parseOptionalSecret(process.env.PLUGGY_CLIENT_ID),
  pluggyClientSecret: parseOptionalSecret(process.env.PLUGGY_CLIENT_SECRET),
  pluggyBaseUrl: parsePluggyBaseUrl(process.env.PLUGGY_BASE_URL),
  // Asaas Sandbox integration. ASAAS_API_KEY is optional so boot/tests keep working
  // without it; routes that depend on it (e.g. bill payment simulation) return 503 when
  // it's unset instead of failing to boot.
  asaasApiKey: parseOptionalSecret(process.env.ASAAS_API_KEY),
  asaasBaseUrl: parseAsaasBaseUrl(process.env.ASAAS_BASE_URL),
  // Separate from ASAAS_API_KEY on purpose: this authenticates inbound webhook calls FROM
  // Asaas, not outbound calls TO Asaas, and the two must never be interchangeable secrets.
  // Optional so the app still boots without it; the webhook route fails closed (503) when unset
  // instead of accepting unauthenticated requests.
  asaasWebhookToken: parseOptionalSecret(process.env.ASAAS_WEBHOOK_TOKEN),
});
