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
