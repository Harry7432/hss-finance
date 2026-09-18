import { AsaasClientError } from './asaas-client.error.js';
import type { AsaasClientErrorCode } from './asaas-client.error.js';

export type AsaasFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AsaasClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface AsaasBalance {
  balance: number;
}

interface AsaasBalanceResponse {
  balance: number;
}

function classifyAsaasError(status: number): AsaasClientErrorCode {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

function isAsaasBalanceResponse(data: unknown): data is AsaasBalanceResponse {
  if (data === null || typeof data !== 'object') return false;
  if (!('balance' in data)) return false;

  const balance = (data as { balance: unknown }).balance;
  return typeof balance === 'number' && Number.isFinite(balance);
}

export class AsaasClient {
  private static readonly DEFAULT_BASE_URL = 'https://api-sandbox.asaas.com/v3';
  private static readonly REQUEST_TIMEOUT_MS = 15_000;

  private readonly baseUrl: string;

  constructor(
    private readonly config: AsaasClientConfig,
    private readonly fetchImpl: AsaasFetch = fetch,
  ) {
    this.baseUrl = config.baseUrl ?? AsaasClient.DEFAULT_BASE_URL;
  }

  async getBalance(): Promise<AsaasBalance> {
    const response = await this.rawFetch('/finance/balance', {
      method: 'GET',
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      throw await this.toClientError(response);
    }

    const data = await this.parseJson<unknown>(response);

    if (!isAsaasBalanceResponse(data)) {
      throw new AsaasClientError({
        code: 'unknown',
        message: 'Asaas balance response had an unexpected shape',
      });
    }

    return { balance: data.balance };
  }

  private authHeaders(): Record<string, string> {
    return {
      access_token: this.config.apiKey,
      'Content-Type': 'application/json',
    };
  }

  private async rawFetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(AsaasClient.REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AsaasClientError({
        code: 'unavailable',
        message: 'Asaas request failed or timed out',
        cause: error,
      });
    }
  }

  private async parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new AsaasClientError({
        code: 'unknown',
        message: 'Asaas response could not be parsed',
        cause: error,
      });
    }
  }

  private async toClientError(response: Response): Promise<AsaasClientError> {
    return new AsaasClientError({
      code: classifyAsaasError(response.status),
      message: `Asaas request failed with status ${response.status}`,
    });
  }
}
