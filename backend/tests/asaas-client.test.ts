import { AsaasClientError } from '../src/integrations/asaas/asaas-client.error.js';
import type { AsaasClientConfig, AsaasFetch } from '../src/integrations/asaas/asaas-client.js';
import { AsaasClient } from '../src/integrations/asaas/asaas-client.js';

const CONFIG: AsaasClientConfig = {
  apiKey: 'sandbox-api-key',
  baseUrl: 'https://sandbox.asaas.test/v3',
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

function createFakeFetch(responses: Response[]): { fetchImpl: AsaasFetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let index = 0;

  const fetchImpl: AsaasFetch = async (url, init) => {
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

function createClient(responses: Response[]): { client: AsaasClient; calls: FakeCall[] } {
  const { fetchImpl, calls } = createFakeFetch(responses);
  const client = new AsaasClient(CONFIG, fetchImpl);
  return { client, calls };
}

function requestHeader(call: FakeCall | undefined, name: string): string | undefined {
  return (call?.init?.headers as Record<string, string> | undefined)?.[name];
}

describe('AsaasClient', () => {
  describe('getBalance', () => {
    it('requests GET /finance/balance authenticated via the access_token header', async () => {
      const { client, calls } = createClient([jsonResponse(200, { balance: 5210.96 })]);

      const result = await client.getBalance();

      expect(calls[0]?.url).toBe('https://sandbox.asaas.test/v3/finance/balance');
      expect(calls[0]?.init?.method).toBe('GET');
      expect(requestHeader(calls[0], 'access_token')).toBe('sandbox-api-key');
      expect(result).toEqual({ balance: 5210.96 });
    });

    it('never authenticates via an Authorization Bearer header', async () => {
      const { client, calls } = createClient([jsonResponse(200, { balance: 0 })]);

      await client.getBalance();

      expect(requestHeader(calls[0], 'Authorization')).toBeUndefined();
      expect(JSON.stringify(calls[0]?.init?.headers)).not.toContain('Bearer');
    });

    it.each([401, 403])('maps status %d to authentication', async (status) => {
      const { client } = createClient([jsonResponse(status, { errors: [{ description: 'x' }] })]);

      await expect(client.getBalance()).rejects.toMatchObject({ code: 'authentication' });
    });

    it('maps 429 to rate_limit', async () => {
      const { client } = createClient([jsonResponse(429, { errors: [] })]);

      await expect(client.getBalance()).rejects.toMatchObject({ code: 'rate_limit' });
    });

    it.each([500, 502, 503])('maps status %d to unavailable', async (status) => {
      const { client } = createClient([jsonResponse(status, {})]);

      await expect(client.getBalance()).rejects.toMatchObject({ code: 'unavailable' });
    });

    it('maps network and timeout failures to unavailable without retrying', async () => {
      const fetchImpl: AsaasFetch = async () => {
        throw new DOMException('The operation was aborted', 'TimeoutError');
      };
      const client = new AsaasClient(CONFIG, fetchImpl);

      await expect(client.getBalance()).rejects.toMatchObject({ code: 'unavailable' });
    });

    it('maps an unparsable JSON response to unknown', async () => {
      const badResponse = {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('invalid json');
        },
      } as unknown as Response;
      const { client } = createClient([badResponse]);

      await expect(client.getBalance()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps an unexpected response shape to unknown', async () => {
      const { client } = createClient([jsonResponse(200, { balance: 'not-a-number' })]);

      await expect(client.getBalance()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a null 2xx body to unknown without letting a raw TypeError escape', async () => {
      const { client } = createClient([jsonResponse(200, null)]);

      await expect(client.getBalance()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a 2xx body missing the balance field to unknown', async () => {
      const { client } = createClient([jsonResponse(200, {})]);

      await expect(client.getBalance()).rejects.toMatchObject({ code: 'unknown' });
    });

    it.each([NaN, Infinity, -Infinity])(
      'maps a non-finite balance (%s) to unknown',
      async (balance) => {
        // The fake fetch returns this value directly from a mocked json(), bypassing
        // real JSON (de)serialization — the same technique used by every other case in
        // this file — so NaN/Infinity can be exercised without any artificial workaround.
        const { client } = createClient([jsonResponse(200, { balance })]);

        await expect(client.getBalance()).rejects.toMatchObject({ code: 'unknown' });
      },
    );

    it('passes an AbortSignal to fetch so the request is bounded by a timeout', async () => {
      const { client, calls } = createClient([jsonResponse(200, { balance: 0 })]);

      await client.getBalance();

      expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('listFinancialTransactions', () => {
    function pageResponse(overrides: Partial<Record<string, unknown>> = {}): unknown {
      return {
        data: [],
        totalCount: 0,
        hasMore: false,
        offset: 0,
        limit: 10,
        ...overrides,
      };
    }

    it('requests GET /financialTransactions authenticated via the access_token header', async () => {
      const { client, calls } = createClient([jsonResponse(200, pageResponse())]);

      await client.listFinancialTransactions();

      expect(calls[0]?.url).toBe('https://sandbox.asaas.test/v3/financialTransactions');
      expect(calls[0]?.init?.method).toBe('GET');
      expect(requestHeader(calls[0], 'access_token')).toBe('sandbox-api-key');
    });

    it('requests a clean URL when no options are given', async () => {
      const { client, calls } = createClient([jsonResponse(200, pageResponse())]);

      await client.listFinancialTransactions();

      expect(calls[0]?.url).toBe('https://sandbox.asaas.test/v3/financialTransactions');
    });

    it('encodes offset and limit in the query string', async () => {
      const { client, calls } = createClient([jsonResponse(200, pageResponse())]);

      await client.listFinancialTransactions({ offset: 20, limit: 50 });

      const url = new URL(calls[0]?.url ?? '');
      expect(url.searchParams.get('offset')).toBe('20');
      expect(url.searchParams.get('limit')).toBe('50');
    });

    it('encodes startDate and finishDate in the query string', async () => {
      const { client, calls } = createClient([jsonResponse(200, pageResponse())]);

      await client.listFinancialTransactions({ startDate: '2024-01-01', finishDate: '2024-01-31' });

      const url = new URL(calls[0]?.url ?? '');
      expect(url.searchParams.get('startDate')).toBe('2024-01-01');
      expect(url.searchParams.get('finishDate')).toBe('2024-01-31');
    });

    it('encodes order in the query string', async () => {
      const { client, calls } = createClient([jsonResponse(200, pageResponse())]);

      await client.listFinancialTransactions({ order: 'desc' });

      const url = new URL(calls[0]?.url ?? '');
      expect(url.searchParams.get('order')).toBe('desc');
    });

    it('rejects limit above 100 before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(client.listFinancialTransactions({ limit: 101 })).rejects.toMatchObject({
        code: 'unknown',
      });
      expect(calls).toHaveLength(0);
    });

    it('rejects limit less than or equal to 0 before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(client.listFinancialTransactions({ limit: 0 })).rejects.toMatchObject({
        code: 'unknown',
      });
      expect(calls).toHaveLength(0);
    });

    it('rejects a negative offset before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(client.listFinancialTransactions({ offset: -1 })).rejects.toMatchObject({
        code: 'unknown',
      });
      expect(calls).toHaveLength(0);
    });

    it.each(['2024-13-01', '2024-02-30', '01-01-2024', 'not-a-date'])(
      'rejects an invalid date %s before calling fetch',
      async (invalidDate) => {
        const { client, calls } = createClient([]);

        await expect(
          client.listFinancialTransactions({ startDate: invalidDate }),
        ).rejects.toMatchObject({ code: 'unknown' });
        expect(calls).toHaveLength(0);
      },
    );

    it('returns normalized pagination for a valid response', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          pageResponse({
            data: [
              {
                id: 'txn_1',
                value: 100.5,
                balance: 500.25,
                type: 'PAYMENT_RECEIVED',
                date: '2024-01-15',
                description: 'Payment',
                paymentId: 'pay_1',
                transferId: null,
                billId: null,
              },
            ],
            totalCount: 1,
            hasMore: false,
            offset: 0,
            limit: 10,
          }),
        ),
      ]);

      const result = await client.listFinancialTransactions();

      expect(result).toEqual({
        data: [
          {
            id: 'txn_1',
            value: 100.5,
            balance: 500.25,
            type: 'PAYMENT_RECEIVED',
            date: '2024-01-15',
            description: 'Payment',
            paymentId: 'pay_1',
            transferId: null,
            billId: null,
          },
        ],
        totalCount: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      });
    });

    it('normalizes missing paymentId, transferId and billId to null', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          pageResponse({
            data: [
              {
                id: 'txn_1',
                value: 10,
                balance: 10,
                type: 'DEPOSIT',
                date: '2024-01-15',
              },
            ],
            totalCount: 1,
          }),
        ),
      ]);

      const result = await client.listFinancialTransactions();

      expect(result.data[0]).toMatchObject({
        description: null,
        paymentId: null,
        transferId: null,
        billId: null,
      });
    });

    it('accepts an item with no balance field as valid, normalized to null', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          pageResponse({
            data: [
              {
                id: 'txn_1',
                value: 10,
                type: 'DEPOSIT',
                date: '2024-01-15',
              },
            ],
            totalCount: 1,
          }),
        ),
      ]);

      const result = await client.listFinancialTransactions();

      expect(result.data[0]).toMatchObject({ balance: null });
    });

    it('accepts an item with a numeric balance as valid', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          pageResponse({
            data: [
              {
                id: 'txn_1',
                value: 10,
                balance: 250.75,
                type: 'DEPOSIT',
                date: '2024-01-15',
              },
            ],
            totalCount: 1,
          }),
        ),
      ]);

      const result = await client.listFinancialTransactions();

      expect(result.data[0]).toMatchObject({ balance: 250.75 });
    });

    it('accepts an item with a null balance as valid, normalized to null', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          pageResponse({
            data: [
              {
                id: 'txn_1',
                value: 10,
                balance: null,
                type: 'DEPOSIT',
                date: '2024-01-15',
              },
            ],
            totalCount: 1,
          }),
        ),
      ]);

      const result = await client.listFinancialTransactions();

      expect(result.data[0]).toMatchObject({ balance: null });
    });

    it('maps an item with a string balance to unknown', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          pageResponse({
            data: [
              {
                id: 'txn_1',
                value: 10,
                balance: 'not-a-number',
                type: 'DEPOSIT',
                date: '2024-01-15',
              },
            ],
            totalCount: 1,
          }),
        ),
      ]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it.each([NaN, Infinity, -Infinity])(
      'maps an item with a non-finite balance (%s) to unknown',
      async (balance) => {
        const { client } = createClient([
          jsonResponse(
            200,
            pageResponse({
              data: [
                {
                  id: 'txn_1',
                  value: 10,
                  balance,
                  type: 'DEPOSIT',
                  date: '2024-01-15',
                },
              ],
              totalCount: 1,
            }),
          ),
        ]);

        await expect(client.listFinancialTransactions()).rejects.toMatchObject({
          code: 'unknown',
        });
      },
    );

    it('preserves exactly the offset and limit returned by the API, regardless of the requested options', async () => {
      const { client } = createClient([
        jsonResponse(200, pageResponse({ offset: 40, limit: 25, totalCount: 100, hasMore: true })),
      ]);

      const result = await client.listFinancialTransactions({ offset: 0, limit: 10 });

      expect(result.offset).toBe(40);
      expect(result.limit).toBe(25);
    });

    it('maps a response missing offset to unknown', async () => {
      const response = pageResponse() as Record<string, unknown>;
      delete response.offset;
      const { client } = createClient([jsonResponse(200, response)]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a response missing limit to unknown', async () => {
      const response = pageResponse() as Record<string, unknown>;
      delete response.limit;
      const { client } = createClient([jsonResponse(200, response)]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a negative offset in the response to unknown', async () => {
      const { client } = createClient([jsonResponse(200, pageResponse({ offset: -1 }))]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it.each(['not-a-number', -1, 1.5])(
      'maps an invalid limit (%s) in the response to unknown',
      async (limit) => {
        const { client } = createClient([jsonResponse(200, pageResponse({ limit }))]);

        await expect(client.listFinancialTransactions()).rejects.toMatchObject({
          code: 'unknown',
        });
      },
    );

    it('maps a null 2xx body to unknown', async () => {
      const { client } = createClient([jsonResponse(200, null)]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a non-array data field to unknown', async () => {
      const { client } = createClient([jsonResponse(200, pageResponse({ data: 'not-an-array' }))]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps an invalid totalCount to unknown', async () => {
      const { client } = createClient([
        jsonResponse(200, pageResponse({ totalCount: 'not-a-number' })),
      ]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps an invalid hasMore to unknown', async () => {
      const { client } = createClient([
        jsonResponse(200, pageResponse({ hasMore: 'not-a-boolean' })),
      ]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps an invalid item to unknown', async () => {
      const { client } = createClient([
        jsonResponse(200, pageResponse({ data: [{ id: 'txn_1' }], totalCount: 1 })),
      ]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({ code: 'unknown' });
    });

    it.each([401, 403])('maps status %d to authentication', async (status) => {
      const { client } = createClient([jsonResponse(status, { errors: [] })]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({
        code: 'authentication',
      });
    });

    it('maps 429 to rate_limit', async () => {
      const { client } = createClient([jsonResponse(429, { errors: [] })]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({
        code: 'rate_limit',
      });
    });

    it.each([500, 502, 503])('maps status %d to unavailable', async (status) => {
      const { client } = createClient([jsonResponse(status, {})]);

      await expect(client.listFinancialTransactions()).rejects.toMatchObject({
        code: 'unavailable',
      });
    });

    it('never exposes the API key in the error message', async () => {
      const { client } = createClient([jsonResponse(401, { errors: [] })]);

      let thrown: unknown;
      try {
        await client.listFinancialTransactions();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AsaasClientError);
      expect((thrown as Error).message).not.toContain(CONFIG.apiKey);
    });
  });

  describe('secret leakage', () => {
    it.each([401, 429, 500])(
      'never exposes the API key in the error message for status %d',
      async (status) => {
        const { client } = createClient([jsonResponse(status, { errors: [] })]);

        let thrown: unknown;
        try {
          await client.getBalance();
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(AsaasClientError);
        expect((thrown as Error).message).not.toContain(CONFIG.apiKey);
      },
    );

    it('never exposes the API key in the error message for an unparsable JSON response', async () => {
      const badResponse = {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('invalid json');
        },
      } as unknown as Response;
      const { client } = createClient([badResponse]);

      let thrown: unknown;
      try {
        await client.getBalance();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AsaasClientError);
      expect((thrown as Error).message).not.toContain(CONFIG.apiKey);
    });
  });
});
