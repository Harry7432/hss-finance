import { OpenFinanceProviderError } from '../open-finance-provider.error.js';
import type { OpenFinanceProviderErrorCode } from '../open-finance-provider.error.js';
import type {
  CreateConnectSessionInput,
  ListProviderTransactionsInput,
  OpenFinanceAccountType,
  OpenFinanceConnectionStatus,
  OpenFinanceProvider,
  ProviderAccount,
  ProviderConnectSession,
  ProviderConnection,
  ProviderTransaction,
  ProviderTransactionPage,
} from '../open-finance-provider.js';

export type PluggyFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface PluggyOpenFinanceProviderConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

interface PluggyAuthResponse {
  apiKey: string;
}

interface PluggyConnectTokenResponse {
  accessToken: string;
}

interface PluggyConnector {
  id: number;
  name: string;
}

interface PluggyItem {
  id: string;
  status: string;
  consentExpiresAt?: string | null;
  connector?: PluggyConnector;
}

interface PluggyAccount {
  id: string;
  type: string;
  subtype?: string | null;
  name: string;
  currencyCode: string;
  balance?: number | null;
  number?: string | null;
}

interface PluggyAccountsResponse {
  results: PluggyAccount[];
}

interface PluggyTransaction {
  id?: string | null;
  description?: string | null;
  amount: number;
  date: string;
  type: string;
  status?: string | null;
  category?: string | null;
}

interface PluggyTransactionsResponse {
  results: PluggyTransaction[];
  next?: string | null;
}

function mapPluggyItemStatus(status: string): OpenFinanceConnectionStatus {
  switch (status) {
    case 'UPDATED':
      return 'connected';
    case 'UPDATING':
    case 'WAITING_USER_INPUT':
      return 'pending';
    case 'LOGIN_ERROR':
    case 'OUTDATED':
      return 'error';
    default:
      return 'error';
  }
}

function mapPluggyAccountType(
  type: string,
  subtype: string | null | undefined,
): OpenFinanceAccountType {
  if (type === 'BANK' && subtype === 'CHECKING_ACCOUNT') return 'checking';
  if (type === 'BANK' && subtype === 'SAVINGS_ACCOUNT') return 'savings';
  if (type === 'CREDIT' && subtype === 'CREDIT_CARD') return 'credit_card';
  return 'other';
}

function formatPluggyAmount(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function maskAccountNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return `****${digits.slice(-4)}`;
}

function mapPluggyTransaction(tx: PluggyTransaction): ProviderTransaction {
  return {
    externalId: tx.id ?? null,
    type: tx.type === 'CREDIT' ? 'income' : 'expense',
    amount: formatPluggyAmount(Math.abs(tx.amount)) ?? '0.00',
    description: tx.description ?? '',
    date: tx.date.slice(0, 10),
    status: tx.status === 'PENDING' ? 'pending' : 'posted',
    categoryHint: tx.category ?? null,
  };
}

function extractPluggyErrorCode(body: unknown): string | null {
  if (body && typeof body === 'object' && 'code' in body) {
    const code = (body as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function classifyPluggyError(
  status: number,
  body: unknown,
  context: 'default' | 'item',
): OpenFinanceProviderErrorCode {
  const bodyCode = extractPluggyErrorCode(body);
  if (bodyCode && /consent/i.test(bodyCode)) return 'consent_expired';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limit';
  if (status === 404 && context === 'item') return 'invalid_connection';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

export class PluggyOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = 'pluggy';

  private static readonly DEFAULT_BASE_URL = 'https://api.pluggy.ai';
  private static readonly REQUEST_TIMEOUT_MS = 15_000;
  // Pluggy documents API Key validity as a few hours; cache well under that so we
  // always renew with margin instead of relying on the exact documented TTL.
  private static readonly API_KEY_CACHE_DURATION_MS = 90 * 60 * 1000;
  // Connect Token is short-lived and the /connect_token response has no expiresAt;
  // assume a conservative lifetime until this can be confirmed against sandbox.
  private static readonly CONNECT_TOKEN_TTL_MS = 30 * 60 * 1000;

  private readonly baseUrl: string;
  private apiKeyCache: { apiKey: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: PluggyOpenFinanceProviderConfig,
    private readonly fetchImpl: PluggyFetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.baseUrl = config.baseUrl ?? PluggyOpenFinanceProvider.DEFAULT_BASE_URL;
  }

  async createConnectSession(input: CreateConnectSessionInput): Promise<ProviderConnectSession> {
    const body: Record<string, unknown> = {};
    if (input.externalConnectionId) {
      body.itemId = input.externalConnectionId;
    }

    const response = await this.requestWithAuth('/connect_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await this.toProviderError(response);
    }

    const data = await this.parseJson<PluggyConnectTokenResponse>(response);

    return {
      token: data.accessToken,
      expiresAt: new Date(this.now() + PluggyOpenFinanceProvider.CONNECT_TOKEN_TTL_MS),
    };
  }

  async getConnection(externalConnectionId: string): Promise<ProviderConnection> {
    const response = await this.requestWithAuth(
      `/items/${encodeURIComponent(externalConnectionId)}`,
    );

    if (!response.ok) {
      throw await this.toProviderError(response, 'item');
    }

    const item = await this.parseJson<PluggyItem>(response);
    const consentExpiresAt = item.consentExpiresAt ? new Date(item.consentExpiresAt) : null;
    const consentExpired = consentExpiresAt !== null && consentExpiresAt.getTime() <= this.now();

    return {
      externalId: item.id,
      institutionId: item.connector ? String(item.connector.id) : '',
      institutionName: item.connector?.name ?? '',
      status: consentExpired ? 'expired' : mapPluggyItemStatus(item.status),
      consentExpiresAt,
    };
  }

  async listAccounts(externalConnectionId: string): Promise<ProviderAccount[]> {
    const response = await this.requestWithAuth(
      `/accounts?itemId=${encodeURIComponent(externalConnectionId)}`,
    );

    if (!response.ok) {
      throw await this.toProviderError(response, 'item');
    }

    const data = await this.parseJson<PluggyAccountsResponse>(response);

    return data.results.map((account) => ({
      externalId: account.id,
      type: mapPluggyAccountType(account.type, account.subtype),
      subtype: account.subtype ?? null,
      name: account.name,
      currencyCode: account.currencyCode,
      balance: formatPluggyAmount(account.balance),
      balanceUpdatedAt: null,
      maskedNumber: maskAccountNumber(account.number),
    }));
  }

  async listTransactions(input: ListProviderTransactionsInput): Promise<ProviderTransactionPage> {
    const response = await this.requestWithAuth(this.buildTransactionsPath(input));

    if (!response.ok) {
      throw await this.toProviderError(response, 'item');
    }

    const data = await this.parseJson<PluggyTransactionsResponse>(response);

    return {
      items: data.results.map(mapPluggyTransaction),
      nextCursor: data.next ?? null,
    };
  }

  async refreshConnection(externalConnectionId: string): Promise<void> {
    const response = await this.requestWithAuth(
      `/items/${encodeURIComponent(externalConnectionId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );

    if (!response.ok) {
      throw await this.toProviderError(response, 'item');
    }
  }

  async disconnectConnection(externalConnectionId: string): Promise<void> {
    const response = await this.requestWithAuth(
      `/items/${encodeURIComponent(externalConnectionId)}`,
      { method: 'DELETE' },
    );

    // Item already gone is treated as a successful (idempotent) disconnect.
    if (!response.ok && response.status !== 404) {
      throw await this.toProviderError(response, 'item');
    }
  }

  private buildTransactionsPath(input: ListProviderTransactionsInput): string {
    // Pluggy's `next` cursor can arrive as an opaque token or as a full next-page
    // URL; when it's a URL we follow it directly instead of parsing its contents.
    if (input.cursor && /^https?:\/\//i.test(input.cursor)) {
      return input.cursor;
    }

    const params = new URLSearchParams({ accountId: input.accountExternalId });
    if (input.from) params.set('from', input.from);
    if (input.to) params.set('to', input.to);
    if (input.cursor) params.set('cursor', input.cursor);

    return `/v2/transactions?${params.toString()}`;
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKeyCache && this.apiKeyCache.expiresAt > this.now()) {
      return this.apiKeyCache.apiKey;
    }

    const response = await this.rawFetch('/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      throw await this.toProviderError(response);
    }

    const data = await this.parseJson<PluggyAuthResponse>(response);

    this.apiKeyCache = {
      apiKey: data.apiKey,
      expiresAt: this.now() + PluggyOpenFinanceProvider.API_KEY_CACHE_DURATION_MS,
    };

    return this.apiKeyCache.apiKey;
  }

  private async requestWithAuth(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
    const apiKey = await this.getApiKey();
    let response = await this.rawFetch(pathOrUrl, this.withApiKeyHeader(init, apiKey));

    if (response.status === 401 || response.status === 403) {
      this.apiKeyCache = null;
      const freshApiKey = await this.getApiKey();
      response = await this.rawFetch(pathOrUrl, this.withApiKeyHeader(init, freshApiKey));
    }

    return response;
  }

  private withApiKeyHeader(init: RequestInit, apiKey: string): RequestInit {
    return {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'X-API-KEY': apiKey,
      },
    };
  }

  private async rawFetch(pathOrUrl: string, init: RequestInit): Promise<Response> {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(PluggyOpenFinanceProvider.REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new OpenFinanceProviderError({
        provider: this.name,
        code: 'unavailable',
        message: 'Pluggy request failed or timed out',
        cause: error,
      });
    }
  }

  private async parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new OpenFinanceProviderError({
        provider: this.name,
        code: 'unknown',
        message: 'Pluggy response could not be parsed',
        cause: error,
      });
    }
  }

  private async toProviderError(
    response: Response,
    context: 'default' | 'item' = 'default',
  ): Promise<OpenFinanceProviderError> {
    const body = await response.json().catch(() => null);
    const code = classifyPluggyError(response.status, body, context);

    return new OpenFinanceProviderError({
      provider: this.name,
      code,
      message: `Pluggy request failed with status ${response.status}`,
    });
  }
}
