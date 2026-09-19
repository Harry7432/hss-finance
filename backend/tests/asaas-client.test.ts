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

  describe('simulateBillPayment', () => {
    const IDENTIFICATION_FIELD = '03399.77779 29900.000000 04751.101017 1 81510000002990';

    function fullBankSlipInfo(overrides: Partial<Record<string, unknown>> = {}): unknown {
      return {
        value: 150,
        dueDate: '2024-02-10',
        originalValue: 150,
        isOverdue: false,
        allowChangeValue: false,
        minValue: null,
        maxValue: null,
        beneficiaryName: 'Beneficiary Co',
        companyName: 'Issuer Co',
        ...overrides,
      };
    }

    function simulationResponse(overrides: Partial<Record<string, unknown>> = {}): unknown {
      return {
        fee: 1.5,
        minimumScheduleDate: '2024-02-01',
        bankSlipInfo: fullBankSlipInfo(),
        ...overrides,
      };
    }

    it('requests POST /bill/simulate authenticated via the access_token header', async () => {
      const { client, calls } = createClient([jsonResponse(200, simulationResponse())]);

      await client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD });

      expect(calls[0]?.url).toBe('https://sandbox.asaas.test/v3/bill/simulate');
      expect(calls[0]?.init?.method).toBe('POST');
      expect(requestHeader(calls[0], 'access_token')).toBe('sandbox-api-key');
    });

    it('sends the identificationField in the request body', async () => {
      const { client, calls } = createClient([jsonResponse(200, simulationResponse())]);

      await client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD });

      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({ identificationField: IDENTIFICATION_FIELD }),
      );
    });

    it('trims the identificationField before sending it', async () => {
      const { client, calls } = createClient([jsonResponse(200, simulationResponse())]);

      await client.simulateBillPayment({ identificationField: `  ${IDENTIFICATION_FIELD}  ` });

      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({ identificationField: IDENTIFICATION_FIELD }),
      );
    });

    it('rejects an empty identificationField before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(client.simulateBillPayment({ identificationField: '' })).rejects.toMatchObject({
        code: 'unknown',
      });
      expect(calls).toHaveLength(0);
    });

    it('rejects a whitespace-only identificationField before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(
        client.simulateBillPayment({ identificationField: '   ' }),
      ).rejects.toMatchObject({ code: 'unknown' });
      expect(calls).toHaveLength(0);
    });

    it('returns a normalized simulation for a valid response', async () => {
      const { client } = createClient([jsonResponse(200, simulationResponse())]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result).toEqual({
        value: 150,
        originalValue: 150,
        dueDate: '2024-02-10',
        isOverdue: false,
        allowChangeValue: false,
        minValue: null,
        maxValue: null,
        beneficiaryName: 'Beneficiary Co',
        companyName: 'Issuer Co',
        fee: 1.5,
        minimumScheduleDate: '2024-02-01',
      });
    });

    it('does not include the identificationField in the returned simulation', async () => {
      const { client } = createClient([jsonResponse(200, simulationResponse())]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(JSON.stringify(result)).not.toContain(IDENTIFICATION_FIELD);
    });

    it('normalizes missing minValue, maxValue, beneficiaryName and companyName to null', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          simulationResponse({
            bankSlipInfo: {
              value: 150,
              dueDate: '2024-02-10',
              originalValue: 150,
              isOverdue: false,
              allowChangeValue: true,
            },
          }),
        ),
      ]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result).toMatchObject({
        minValue: null,
        maxValue: null,
        beneficiaryName: null,
        companyName: null,
      });
    });

    it('normalizes missing originalValue, isOverdue and allowChangeValue to null', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          simulationResponse({ bankSlipInfo: { value: 150, dueDate: '2024-02-10' } }),
        ),
      ]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result).toMatchObject({
        originalValue: null,
        isOverdue: null,
        allowChangeValue: null,
      });
    });

    it('normalizes missing top-level fee and minimumScheduleDate to null', async () => {
      const { client } = createClient([jsonResponse(200, { bankSlipInfo: fullBankSlipInfo() })]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result).toMatchObject({ fee: null, minimumScheduleDate: null });
    });

    // Case 1 from the review: the smallest response the real contract allows — only the
    // two fields our domain actually needs, nothing else present at all.
    it('accepts a minimal response containing only value and dueDate', async () => {
      const { client } = createClient([
        jsonResponse(200, { bankSlipInfo: { value: 100, dueDate: '2024-03-01' } }),
      ]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result).toEqual({
        value: 100,
        dueDate: '2024-03-01',
        originalValue: null,
        isOverdue: null,
        allowChangeValue: null,
        minValue: null,
        maxValue: null,
        beneficiaryName: null,
        companyName: null,
        fee: null,
        minimumScheduleDate: null,
      });
    });

    it('accepts explicit null for every optional field', async () => {
      const { client } = createClient([
        jsonResponse(200, {
          fee: null,
          minimumScheduleDate: null,
          bankSlipInfo: {
            value: 150,
            dueDate: '2024-02-10',
            originalValue: null,
            isOverdue: null,
            allowChangeValue: null,
            minValue: null,
            maxValue: null,
            beneficiaryName: null,
            companyName: null,
          },
        }),
      ]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result).toEqual({
        value: 150,
        dueDate: '2024-02-10',
        originalValue: null,
        isOverdue: null,
        allowChangeValue: null,
        minValue: null,
        maxValue: null,
        beneficiaryName: null,
        companyName: null,
        fee: null,
        minimumScheduleDate: null,
      });
    });

    it('passes through a valid originalValue', async () => {
      const { client } = createClient([
        jsonResponse(
          200,
          simulationResponse({ bankSlipInfo: fullBankSlipInfo({ originalValue: 175.5 }) }),
        ),
      ]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result.originalValue).toBe(175.5);
    });

    it('passes through a valid fee', async () => {
      const { client } = createClient([jsonResponse(200, simulationResponse({ fee: 3.25 }))]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result.fee).toBe(3.25);
    });

    it.each([true, false])('passes through a valid isOverdue (%s)', async (isOverdue) => {
      const { client } = createClient([
        jsonResponse(200, simulationResponse({ bankSlipInfo: fullBankSlipInfo({ isOverdue }) })),
      ]);

      const result = await client.simulateBillPayment({
        identificationField: IDENTIFICATION_FIELD,
      });

      expect(result.isOverdue).toBe(isOverdue);
    });

    it.each([true, false])(
      'passes through a valid allowChangeValue (%s)',
      async (allowChangeValue) => {
        const { client } = createClient([
          jsonResponse(
            200,
            simulationResponse({ bankSlipInfo: fullBankSlipInfo({ allowChangeValue }) }),
          ),
        ]);

        const result = await client.simulateBillPayment({
          identificationField: IDENTIFICATION_FIELD,
        });

        expect(result.allowChangeValue).toBe(allowChangeValue);
      },
    );

    it.each(['originalValue', 'fee', 'minValue', 'maxValue'])(
      'maps an optional number field (%s) with a string value to unknown',
      async (field) => {
        const overrides =
          field === 'fee'
            ? { fee: 'not-a-number' }
            : { bankSlipInfo: fullBankSlipInfo({ [field]: 'not-a-number' }) };
        const { client } = createClient([jsonResponse(200, simulationResponse(overrides))]);

        await expect(
          client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
        ).rejects.toMatchObject({ code: 'unknown' });
      },
    );

    it.each(['isOverdue', 'allowChangeValue'])(
      'maps an optional boolean field (%s) with a non-boolean value to unknown',
      async (field) => {
        const { client } = createClient([
          jsonResponse(
            200,
            simulationResponse({ bankSlipInfo: fullBankSlipInfo({ [field]: 'true' }) }),
          ),
        ]);

        await expect(
          client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
        ).rejects.toMatchObject({ code: 'unknown' });
      },
    );

    it('maps a response missing value to unknown', async () => {
      const { client } = createClient([
        jsonResponse(200, simulationResponse({ bankSlipInfo: { dueDate: '2024-02-10' } })),
      ]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it.each(['not-a-number', NaN, Infinity, -Infinity])(
      'maps an invalid value (%s) to unknown',
      async (value) => {
        const { client } = createClient([
          jsonResponse(200, simulationResponse({ bankSlipInfo: fullBankSlipInfo({ value }) })),
        ]);

        await expect(
          client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
        ).rejects.toMatchObject({ code: 'unknown' });
      },
    );

    it('maps a response missing dueDate to unknown', async () => {
      const { client } = createClient([
        jsonResponse(200, simulationResponse({ bankSlipInfo: { value: 150 } })),
      ]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it.each(['', 20240210, null])('maps an invalid dueDate (%s) to unknown', async (dueDate) => {
      const { client } = createClient([
        jsonResponse(200, simulationResponse({ bankSlipInfo: fullBankSlipInfo({ dueDate }) })),
      ]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a response missing bankSlipInfo entirely to unknown', async () => {
      const { client } = createClient([
        jsonResponse(200, { fee: 1, minimumScheduleDate: '2024-02-01' }),
      ]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a 400 (invalid bill) response to invalid_request', async () => {
      const { client } = createClient([
        jsonResponse(400, { errors: [{ code: 'invalid_billet', description: 'Invalid bill' }] }),
      ]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'invalid_request' });
    });

    it('never includes the identificationField in a 400 error message', async () => {
      const { client } = createClient([jsonResponse(400, { errors: [] })]);

      let thrown: unknown;
      try {
        await client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AsaasClientError);
      expect((thrown as Error).message).not.toContain(IDENTIFICATION_FIELD);
    });

    it.each([401, 403])('maps status %d to authentication', async (status) => {
      const { client } = createClient([jsonResponse(status, { errors: [] })]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'authentication' });
    });

    it('maps 429 to rate_limit', async () => {
      const { client } = createClient([jsonResponse(429, { errors: [] })]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'rate_limit' });
    });

    it.each([500, 502, 503])('maps status %d to unavailable', async (status) => {
      const { client } = createClient([jsonResponse(status, {})]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'unavailable' });
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

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps an unexpected response shape to unknown', async () => {
      const { client } = createClient([jsonResponse(200, { bankSlipInfo: {} })]);

      await expect(
        client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('never exposes the API key in the error message', async () => {
      const { client } = createClient([jsonResponse(401, { errors: [] })]);

      let thrown: unknown;
      try {
        await client.simulateBillPayment({ identificationField: IDENTIFICATION_FIELD });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AsaasClientError);
      expect((thrown as Error).message).not.toContain(CONFIG.apiKey);
    });
  });

  describe('createBillPayment', () => {
    const IDENTIFICATION_FIELD = '03399.77779 29900.000000 04751.101017 1 81510000002990';
    const EXTERNAL_REFERENCE = '8f14e45f-ceea-467e-bd22-0d8b2c1d0c99';

    function billPaymentResponse(overrides: Partial<Record<string, unknown>> = {}): unknown {
      return {
        id: 'bill_000001',
        status: 'PENDING',
        value: 150,
        dueDate: '2026-09-20',
        scheduleDate: '2026-09-18',
        ...overrides,
      };
    }

    it('requests POST /bill authenticated via the access_token header', async () => {
      const { client, calls } = createClient([jsonResponse(200, billPaymentResponse())]);

      await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: EXTERNAL_REFERENCE,
      });

      expect(calls[0]?.url).toBe('https://sandbox.asaas.test/v3/bill');
      expect(calls[0]?.init?.method).toBe('POST');
      expect(requestHeader(calls[0], 'access_token')).toBe('sandbox-api-key');
    });

    it('sends identificationField and externalReference in the request body when no optional field is given', async () => {
      const { client, calls } = createClient([jsonResponse(200, billPaymentResponse())]);

      await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: EXTERNAL_REFERENCE,
      });

      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      );
    });

    it('trims the identificationField before sending it', async () => {
      const { client, calls } = createClient([jsonResponse(200, billPaymentResponse())]);

      await client.createBillPayment({
        identificationField: `  ${IDENTIFICATION_FIELD}  `,
        externalReference: EXTERNAL_REFERENCE,
      });

      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      );
    });

    it('trims the externalReference before sending it', async () => {
      const { client, calls } = createClient([jsonResponse(200, billPaymentResponse())]);

      await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: `  ${EXTERNAL_REFERENCE}  `,
      });

      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      );
    });

    it('includes scheduleDate in the request body when provided', async () => {
      const { client, calls } = createClient([jsonResponse(200, billPaymentResponse())]);

      await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: EXTERNAL_REFERENCE,
        scheduleDate: '2026-09-19',
      });

      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
          scheduleDate: '2026-09-19',
        }),
      );
    });

    it('includes value in the request body when provided', async () => {
      const { client, calls } = createClient([jsonResponse(200, billPaymentResponse())]);

      await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: EXTERNAL_REFERENCE,
        value: 42.5,
      });

      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
          value: 42.5,
        }),
      );
    });

    it('rejects an empty identificationField before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(
        client.createBillPayment({
          identificationField: '',
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'unknown' });
      expect(calls).toHaveLength(0);
    });

    it('rejects a whitespace-only identificationField before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(
        client.createBillPayment({
          identificationField: '   ',
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'unknown' });
      expect(calls).toHaveLength(0);
    });

    it('rejects an empty externalReference before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: '',
        }),
      ).rejects.toMatchObject({ code: 'unknown' });
      expect(calls).toHaveLength(0);
    });

    it('rejects a whitespace-only externalReference before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: '   ',
        }),
      ).rejects.toMatchObject({ code: 'unknown' });
      expect(calls).toHaveLength(0);
    });

    it('rejects a malformed scheduleDate before calling fetch', async () => {
      const { client, calls } = createClient([]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
          scheduleDate: '19-09-2026',
        }),
      ).rejects.toMatchObject({ code: 'unknown' });
      expect(calls).toHaveLength(0);
    });

    it.each([0, -10, NaN, Infinity])(
      'rejects an invalid value (%s) before calling fetch',
      async (value) => {
        const { client, calls } = createClient([]);

        await expect(
          client.createBillPayment({
            identificationField: IDENTIFICATION_FIELD,
            externalReference: EXTERNAL_REFERENCE,
            value,
          }),
        ).rejects.toMatchObject({ code: 'unknown' });
        expect(calls).toHaveLength(0);
      },
    );

    it('returns a normalized bill payment for a valid response', async () => {
      const { client } = createClient([jsonResponse(200, billPaymentResponse())]);

      const result = await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: EXTERNAL_REFERENCE,
      });

      expect(result).toEqual({
        id: 'bill_000001',
        status: 'PENDING',
        value: 150,
        dueDate: '2026-09-20',
        scheduleDate: '2026-09-18',
      });
    });

    it('does not include the identificationField in the returned bill payment', async () => {
      const { client } = createClient([jsonResponse(200, billPaymentResponse())]);

      const result = await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: EXTERNAL_REFERENCE,
      });

      expect(JSON.stringify(result)).not.toContain(IDENTIFICATION_FIELD);
    });

    it('normalizes missing value, dueDate and scheduleDate to null', async () => {
      const { client } = createClient([
        jsonResponse(200, { id: 'bill_000002', status: 'PENDING' }),
      ]);

      const result = await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: EXTERNAL_REFERENCE,
      });

      expect(result).toEqual({
        id: 'bill_000002',
        status: 'PENDING',
        value: null,
        dueDate: null,
        scheduleDate: null,
      });
    });

    it('passes through any status string reported by Asaas', async () => {
      const { client } = createClient([
        jsonResponse(200, billPaymentResponse({ status: 'BANK_PROCESSING' })),
      ]);

      const result = await client.createBillPayment({
        identificationField: IDENTIFICATION_FIELD,
        externalReference: EXTERNAL_REFERENCE,
      });

      expect(result.status).toBe('BANK_PROCESSING');
    });

    it('maps a response missing id to unknown', async () => {
      const { client } = createClient([jsonResponse(200, billPaymentResponse({ id: undefined }))]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a response missing status to unknown', async () => {
      const { client } = createClient([
        jsonResponse(200, billPaymentResponse({ status: undefined })),
      ]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('maps a 400 (invalid bill) response to invalid_request', async () => {
      const { client } = createClient([
        jsonResponse(400, { errors: [{ code: 'invalid_billet', description: 'Invalid bill' }] }),
      ]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'invalid_request' });
    });

    it('never includes the identificationField in a 400 error message', async () => {
      const { client } = createClient([jsonResponse(400, { errors: [] })]);

      let thrown: unknown;
      try {
        await client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AsaasClientError);
      expect((thrown as Error).message).not.toContain(IDENTIFICATION_FIELD);
    });

    it('does not include the externalReference in a 400 error message', async () => {
      const { client } = createClient([jsonResponse(400, { errors: [] })]);

      let thrown: unknown;
      try {
        await client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AsaasClientError);
      expect((thrown as Error).message).not.toContain(EXTERNAL_REFERENCE);
    });

    it.each([401, 403])('maps status %d to authentication', async (status) => {
      const { client } = createClient([jsonResponse(status, { errors: [] })]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'authentication' });
    });

    it('maps 429 to rate_limit', async () => {
      const { client } = createClient([jsonResponse(429, { errors: [] })]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'rate_limit' });
    });

    it.each([500, 502, 503])('maps status %d to unavailable', async (status) => {
      const { client } = createClient([jsonResponse(status, {})]);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'unavailable' });
    });

    it('maps network and timeout failures to unavailable without retrying', async () => {
      const fetchImpl: AsaasFetch = async () => {
        throw new DOMException('The operation was aborted', 'TimeoutError');
      };
      const client = new AsaasClient(CONFIG, fetchImpl);

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'unavailable' });
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

      await expect(
        client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        }),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('never exposes the API key in the error message', async () => {
      const { client } = createClient([jsonResponse(401, { errors: [] })]);

      let thrown: unknown;
      try {
        await client.createBillPayment({
          identificationField: IDENTIFICATION_FIELD,
          externalReference: EXTERNAL_REFERENCE,
        });
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
