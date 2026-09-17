import { OpenFinanceProviderError } from '../src/integrations/open-finance/open-finance-provider.error.js';
import { OpenFinanceProviderRegistry } from '../src/integrations/open-finance/open-finance-provider-registry.js';
import type {
  PluggyFetch,
  PluggyOpenFinanceProviderConfig,
} from '../src/integrations/open-finance/providers/pluggy-open-finance-provider.js';
import { PluggyOpenFinanceProvider } from '../src/integrations/open-finance/providers/pluggy-open-finance-provider.js';

const CONFIG: PluggyOpenFinanceProviderConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  baseUrl: 'https://sandbox.pluggy.test',
};

interface FakeCall {
  url: string;
  init: RequestInit | undefined;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function createFakeFetch(responses: Response[]): { fetchImpl: PluggyFetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let index = 0;

  const fetchImpl: PluggyFetch = async (url, init) => {
    calls.push({ url, init });
    const response = responses[index];
    index += 1;
    if (!response) {
      throw new Error(`No fake response queued for call #${index} (${url})`);
    }
    return response;
  };

  return { fetchImpl, calls };
}

function createProvider(responses: Response[], now: () => number = () => 0) {
  const { fetchImpl, calls } = createFakeFetch(responses);
  const provider = new PluggyOpenFinanceProvider(CONFIG, fetchImpl, now);
  return { provider, calls };
}

function itemFixture(status: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'item-1',
    status,
    consentExpiresAt: null,
    connector: { id: 10, name: 'Bank X' },
    ...overrides,
  };
}

function requestHeader(call: FakeCall | undefined, name: string): string | undefined {
  return (call?.init?.headers as Record<string, string> | undefined)?.[name];
}

describe('PluggyOpenFinanceProvider', () => {
  describe('authentication', () => {
    it('authenticates via /auth and forwards the apiKey as X-API-KEY', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, itemFixture('UPDATED')),
      ]);

      await provider.getConnection('item-1');

      expect(calls[0]?.url).toBe('https://sandbox.pluggy.test/auth');
      expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
        clientId: 'client-id',
        clientSecret: 'client-secret',
      });
      expect(calls[1]?.url).toBe('https://sandbox.pluggy.test/items/item-1');
      expect(requestHeader(calls[1], 'X-API-KEY')).toBe('api-key-1');
    });

    it('reuses the cached apiKey across multiple calls', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, itemFixture('UPDATED')),
        jsonResponse(200, itemFixture('UPDATED')),
      ]);

      await provider.getConnection('item-1');
      await provider.getConnection('item-1');

      expect(calls.filter((call) => call.url.endsWith('/auth'))).toHaveLength(1);
    });

    it('renews the apiKey once the cache window elapses', async () => {
      let currentTime = 0;
      const { provider, calls } = createProvider(
        [
          jsonResponse(200, { apiKey: 'api-key-1' }),
          jsonResponse(200, itemFixture('UPDATED')),
          jsonResponse(200, { apiKey: 'api-key-2' }),
          jsonResponse(200, itemFixture('UPDATED')),
        ],
        () => currentTime,
      );

      await provider.getConnection('item-1');
      currentTime += 90 * 60 * 1000 + 1;
      await provider.getConnection('item-1');

      expect(calls.filter((call) => call.url.endsWith('/auth'))).toHaveLength(2);
    });

    it('recovers from a stale apiKey by re-authenticating once and retrying the request', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'stale-key' }),
        jsonResponse(401, { message: 'invalid api key' }),
        jsonResponse(200, { apiKey: 'fresh-key' }),
        jsonResponse(200, itemFixture('UPDATED')),
      ]);

      const connection = await provider.getConnection('item-1');

      expect(connection.status).toBe('connected');
      expect(calls).toHaveLength(4);
      expect(requestHeader(calls[3], 'X-API-KEY')).toBe('fresh-key');
    });

    it('retries authentication at most once and then surfaces an authentication error', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(401, { message: 'invalid api key' }),
        jsonResponse(200, { apiKey: 'api-key-2' }),
        jsonResponse(401, { message: 'invalid api key' }),
      ]);

      await expect(provider.getConnection('item-1')).rejects.toMatchObject({
        code: 'authentication',
      });
      expect(calls.filter((call) => call.url.endsWith('/auth'))).toHaveLength(2);
      expect(calls).toHaveLength(4);
    });

    it('never exposes clientSecret or apiKey to callers', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'super-secret-key' }),
        jsonResponse(200, { accessToken: 'connect-token-abc' }),
      ]);

      const session = await provider.createConnectSession({});

      expect(JSON.stringify(session)).not.toContain('super-secret-key');
      expect(JSON.stringify(session)).not.toContain(CONFIG.clientSecret);
      expect(session.token).toBe('connect-token-abc');
    });

    it('never leaks credentials in the error message when authentication fails', async () => {
      const { provider } = createProvider([
        jsonResponse(401, { message: 'invalid client-secret' }),
      ]);

      let thrown: unknown;
      try {
        await provider.getConnection('item-1');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(OpenFinanceProviderError);
      const message = (thrown as Error).message;
      expect(message).not.toContain('client-secret');
      expect(message).not.toContain(CONFIG.clientSecret);
    });
  });

  describe('createConnectSession', () => {
    it('posts to /connect_token and maps accessToken with a coherent expiresAt', async () => {
      const { provider, calls } = createProvider(
        [
          jsonResponse(200, { apiKey: 'api-key-1' }),
          jsonResponse(200, { accessToken: 'connect-token-1' }),
        ],
        () => 1_000,
      );

      const session = await provider.createConnectSession({});

      expect(session.token).toBe('connect-token-1');
      expect(session.expiresAt?.getTime()).toBe(1_000 + 30 * 60 * 1000);
      expect(calls[1]?.url).toBe('https://sandbox.pluggy.test/connect_token');
      expect(JSON.parse(calls[1]?.init?.body as string)).toEqual({});
    });

    it('includes itemId when creating a connect session for an existing connection', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, { accessToken: 'connect-token-1' }),
      ]);

      await provider.createConnectSession({ externalConnectionId: 'item-1' });

      expect(JSON.parse(calls[1]?.init?.body as string)).toEqual({ itemId: 'item-1' });
    });
  });

  describe('getConnection', () => {
    it.each([
      ['UPDATED', 'connected'],
      ['UPDATING', 'pending'],
      ['WAITING_USER_INPUT', 'pending'],
      ['LOGIN_ERROR', 'error'],
      ['OUTDATED', 'error'],
    ])('maps item status %s to %s', async (pluggyStatus, expected) => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, itemFixture(pluggyStatus)),
      ]);

      const connection = await provider.getConnection('item-1');

      expect(connection.status).toBe(expected);
    });

    it('marks the connection as expired once consentExpiresAt has passed, regardless of remote status', async () => {
      const { provider } = createProvider(
        [
          jsonResponse(200, { apiKey: 'api-key-1' }),
          jsonResponse(
            200,
            itemFixture('UPDATED', { consentExpiresAt: '2026-01-01T00:00:00.000Z' }),
          ),
        ],
        () => new Date('2026-06-01T00:00:00.000Z').getTime(),
      );

      const connection = await provider.getConnection('item-1');

      expect(connection.status).toBe('expired');
    });

    it('maps external identifiers and institution data from the item payload', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, itemFixture('UPDATED')),
      ]);

      const connection = await provider.getConnection('item-1');

      expect(connection.externalId).toBe('item-1');
      expect(connection.institutionId).toBe('10');
      expect(connection.institutionName).toBe('Bank X');
    });
  });

  describe('listAccounts', () => {
    it.each([
      ['BANK', 'CHECKING_ACCOUNT', 'checking'],
      ['BANK', 'SAVINGS_ACCOUNT', 'savings'],
      ['CREDIT', 'CREDIT_CARD', 'credit_card'],
      ['BANK', 'SOME_NEW_SUBTYPE', 'other'],
    ])('maps pluggy account %s/%s to %s', async (type, subtype, expected) => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, {
          results: [
            {
              id: 'acc-1',
              type,
              subtype,
              name: 'Account',
              currencyCode: 'BRL',
              balance: 100,
              number: '0001/123456-7',
            },
          ],
        }),
      ]);

      const [account] = await provider.listAccounts('item-1');

      expect(account?.type).toBe(expected);
    });

    it('converts the balance to a string without destructive float conversion', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, {
          results: [
            {
              id: 'acc-1',
              type: 'BANK',
              subtype: 'CHECKING_ACCOUNT',
              name: 'Account',
              currencyCode: 'BRL',
              balance: 1234.5,
              number: null,
            },
          ],
        }),
      ]);

      const [account] = await provider.listAccounts('item-1');

      expect(account?.balance).toBe('1234.50');
    });

    it('masks the account number and never exposes the full value', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, {
          results: [
            {
              id: 'acc-1',
              type: 'BANK',
              subtype: 'CHECKING_ACCOUNT',
              name: 'Account',
              currencyCode: 'BRL',
              balance: 0,
              number: '0001/123456-7',
            },
          ],
        }),
      ]);

      const [account] = await provider.listAccounts('item-1');

      expect(account?.maskedNumber).toBe('****4567');
      expect(account?.maskedNumber).not.toContain('123456');
      expect(JSON.stringify(account)).not.toContain('0001/123456-7');
    });

    it('returns null maskedNumber when no account number is provided', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, {
          results: [
            {
              id: 'acc-1',
              type: 'BANK',
              subtype: 'CHECKING_ACCOUNT',
              name: 'Account',
              currencyCode: 'BRL',
              balance: 0,
              number: null,
            },
          ],
        }),
      ]);

      const [account] = await provider.listAccounts('item-1');

      expect(account?.maskedNumber).toBeNull();
    });
  });

  describe('listTransactions', () => {
    it('maps CREDIT to income and DEBIT to expense while preserving magnitude', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, {
          results: [
            {
              id: 'tx-1',
              description: 'Salary',
              amount: 2000,
              date: '2026-09-05T00:00:00.000Z',
              type: 'CREDIT',
              status: 'POSTED',
              category: 'salary',
            },
            {
              id: 'tx-2',
              description: 'Coffee',
              amount: -10,
              date: '2026-09-01T00:00:00.000Z',
              type: 'DEBIT',
              status: 'PENDING',
              category: null,
            },
          ],
          next: null,
        }),
      ]);

      const page = await provider.listTransactions({ accountExternalId: 'acc-1' });

      expect(page.items[0]).toMatchObject({
        type: 'income',
        amount: '2000.00',
        status: 'posted',
        date: '2026-09-05',
      });
      expect(page.items[1]).toMatchObject({
        type: 'expense',
        amount: '10.00',
        status: 'pending',
        date: '2026-09-01',
      });
      expect(page.nextCursor).toBeNull();
    });

    it('forwards accountId, from and to as query parameters to /v2/transactions', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, { results: [], next: null }),
      ]);

      await provider.listTransactions({
        accountExternalId: 'acc-1',
        from: '2026-09-01',
        to: '2026-09-30',
      });

      const url = new URL(calls[1]?.url as string);
      expect(url.pathname).toBe('/v2/transactions');
      expect(url.searchParams.get('accountId')).toBe('acc-1');
      expect(url.searchParams.get('from')).toBe('2026-09-01');
      expect(url.searchParams.get('to')).toBe('2026-09-30');
    });

    it('forwards an opaque cursor token as a query parameter without interpreting it', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, { results: [], next: null }),
      ]);

      await provider.listTransactions({ accountExternalId: 'acc-1', cursor: 'opaque-cursor-1' });

      const url = new URL(calls[1]?.url as string);
      expect(url.searchParams.get('cursor')).toBe('opaque-cursor-1');
    });

    it('follows a next cursor that arrives as a full URL unmodified', async () => {
      const nextUrl = 'https://sandbox.pluggy.test/v2/transactions?accountId=acc-1&cursor=abc123';
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, { results: [], next: null }),
      ]);

      await provider.listTransactions({ accountExternalId: 'acc-1', cursor: nextUrl });

      expect(calls[1]?.url).toBe(nextUrl);
    });

    it('reports the next page cursor from the response as an opaque value', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, { results: [], next: 'cursor-2' }),
      ]);

      const page = await provider.listTransactions({ accountExternalId: 'acc-1' });

      expect(page.nextCursor).toBe('cursor-2');
    });

    it('represents the end of pagination as a null cursor', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, { results: [], next: null }),
      ]);

      const page = await provider.listTransactions({ accountExternalId: 'acc-1' });

      expect(page.nextCursor).toBeNull();
    });
  });

  describe('refreshConnection', () => {
    it('sends PATCH to /items/:id to trigger a refresh', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, {}),
      ]);

      await provider.refreshConnection('item-1');

      expect(calls[1]?.url).toBe('https://sandbox.pluggy.test/items/item-1');
      expect(calls[1]?.init?.method).toBe('PATCH');
    });

    it('translates a refresh rejection into a normalized error', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(400, { message: 'requires user interaction' }),
      ]);

      await expect(provider.refreshConnection('item-1')).rejects.toBeInstanceOf(
        OpenFinanceProviderError,
      );
    });
  });

  describe('disconnectConnection', () => {
    it('sends DELETE to /items/:id', async () => {
      const { provider, calls } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(200, {}),
      ]);

      await provider.disconnectConnection('item-1');

      expect(calls[1]?.url).toBe('https://sandbox.pluggy.test/items/item-1');
      expect(calls[1]?.init?.method).toBe('DELETE');
    });

    it('treats a 404 on disconnect as an idempotent success', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(404, { message: 'not found' }),
      ]);

      await expect(provider.disconnectConnection('item-1')).resolves.toBeUndefined();
    });
  });

  describe('error translation', () => {
    it('maps 429 to rate_limit', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(429, { message: 'too many requests' }),
      ]);

      await expect(provider.getConnection('item-1')).rejects.toMatchObject({ code: 'rate_limit' });
    });

    it('maps 404 on item endpoints to invalid_connection', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(404, { message: 'not found' }),
      ]);

      await expect(provider.getConnection('item-1')).rejects.toMatchObject({
        code: 'invalid_connection',
      });
    });

    it('maps 5xx to unavailable', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(503, { message: 'down' }),
      ]);

      await expect(provider.getConnection('item-1')).rejects.toMatchObject({ code: 'unavailable' });
    });

    it('maps network and timeout failures to unavailable without an infinite retry', async () => {
      const fetchImpl: PluggyFetch = async () => {
        throw new DOMException('The operation was aborted', 'TimeoutError');
      };
      const provider = new PluggyOpenFinanceProvider(CONFIG, fetchImpl, () => 0);

      await expect(provider.getConnection('item-1')).rejects.toMatchObject({ code: 'unavailable' });
    });

    it('maps unrecognized status codes to unknown', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(418, { message: 'teapot' }),
      ]);

      await expect(provider.getConnection('item-1')).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps an unparsable success response to an unknown error', async () => {
      const badResponse = {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('invalid json');
        },
      } as unknown as Response;

      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        badResponse,
      ]);

      await expect(provider.getConnection('item-1')).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a consent-expired error body to consent_expired', async () => {
      const { provider } = createProvider([
        jsonResponse(200, { apiKey: 'api-key-1' }),
        jsonResponse(400, { code: 'CONSENT_EXPIRED', message: 'consent expired' }),
      ]);

      await expect(provider.getConnection('item-1')).rejects.toMatchObject({
        code: 'consent_expired',
      });
    });
  });

  describe('registry compatibility', () => {
    it('satisfies OpenFinanceProvider and can be registered manually', () => {
      const registry = new OpenFinanceProviderRegistry();
      const provider = new PluggyOpenFinanceProvider(CONFIG);

      registry.register(provider);

      expect(registry.get('pluggy')).toBe(provider);
    });
  });
});
