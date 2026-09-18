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

export interface AsaasFinancialTransaction {
  id: string;
  value: number;
  type: string;
  date: string;
  balance: number | null;
  description: string | null;
  paymentId: string | null;
  transferId: string | null;
  billId: string | null;
}

export interface AsaasFinancialTransactionPage {
  data: AsaasFinancialTransaction[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface AsaasListFinancialTransactionsOptions {
  offset?: number;
  limit?: number;
  startDate?: string;
  finishDate?: string;
  order?: 'asc' | 'desc';
}

interface AsaasFinancialTransactionPageResponse {
  data: unknown[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface AsaasSimulateBillPaymentInput {
  identificationField: string;
}

export interface AsaasBillSimulation {
  value: number;
  dueDate: string;
  originalValue: number | null;
  isOverdue: boolean | null;
  allowChangeValue: boolean | null;
  minValue: number | null;
  maxValue: number | null;
  beneficiaryName: string | null;
  companyName: string | null;
  fee: number | null;
  minimumScheduleDate: string | null;
}

// Only `value` and `dueDate` are indispensable to our domain (there is no useful
// simulation without them). The Asaas OpenAPI contract does not mark any other field
// here as required, so everything else is optional/nullable — treating them as
// mandatory previously meant a legitimate 200 could be rejected as `unknown` just
// because Asaas omitted a field our type guard assumed was always present.
interface AsaasBillSimulationBankSlipInfoResponse {
  value: number;
  dueDate: string;
  originalValue: number | null | undefined;
  isOverdue: boolean | null | undefined;
  allowChangeValue: boolean | null | undefined;
  minValue: number | null | undefined;
  maxValue: number | null | undefined;
  beneficiaryName: string | null | undefined;
  companyName: string | null | undefined;
}

interface AsaasBillSimulationResponse {
  fee: number | null | undefined;
  minimumScheduleDate: string | null | undefined;
  bankSlipInfo: AsaasBillSimulationBankSlipInfoResponse;
}

const ASAAS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function isValidAsaasDateString(value: string): boolean {
  if (!ASAAS_DATE_PATTERN.test(value)) return false;

  const parts = value.split('-').map(Number);
  const year = parts[0] ?? NaN;
  const month = parts[1] ?? NaN;
  const day = parts[2] ?? NaN;
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNullableFiniteNumber(value: unknown): value is number | null | undefined {
  return (
    value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value))
  );
}

function isOptionalNullableBoolean(value: unknown): value is boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean';
}

function isAsaasFinancialTransaction(item: unknown): item is AsaasFinancialTransaction {
  if (item === null || typeof item !== 'object') return false;

  const record = item as Record<string, unknown>;

  return (
    typeof record.id === 'string' &&
    typeof record.value === 'number' &&
    Number.isFinite(record.value) &&
    typeof record.type === 'string' &&
    typeof record.date === 'string' &&
    isOptionalNullableFiniteNumber(record.balance) &&
    isOptionalNullableString(record.description) &&
    isOptionalNullableString(record.paymentId) &&
    isOptionalNullableString(record.transferId) &&
    isOptionalNullableString(record.billId)
  );
}

function isAsaasBillSimulationBankSlipInfo(
  value: unknown,
): value is AsaasBillSimulationBankSlipInfoResponse {
  if (value === null || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.value === 'number' &&
    Number.isFinite(record.value) &&
    typeof record.dueDate === 'string' &&
    record.dueDate.length > 0 &&
    isOptionalNullableFiniteNumber(record.originalValue) &&
    isOptionalNullableBoolean(record.isOverdue) &&
    isOptionalNullableBoolean(record.allowChangeValue) &&
    isOptionalNullableFiniteNumber(record.minValue) &&
    isOptionalNullableFiniteNumber(record.maxValue) &&
    isOptionalNullableString(record.beneficiaryName) &&
    isOptionalNullableString(record.companyName)
  );
}

function isAsaasBillSimulationResponse(data: unknown): data is AsaasBillSimulationResponse {
  if (data === null || typeof data !== 'object') return false;

  const record = data as Record<string, unknown>;

  return (
    isOptionalNullableFiniteNumber(record.fee) &&
    isOptionalNullableString(record.minimumScheduleDate) &&
    isAsaasBillSimulationBankSlipInfo(record.bankSlipInfo)
  );
}

function isAsaasFinancialTransactionPageResponse(
  data: unknown,
): data is AsaasFinancialTransactionPageResponse {
  if (data === null || typeof data !== 'object') return false;

  const record = data as Record<string, unknown>;

  return (
    Array.isArray(record.data) &&
    typeof record.totalCount === 'number' &&
    Number.isInteger(record.totalCount) &&
    record.totalCount >= 0 &&
    typeof record.hasMore === 'boolean' &&
    typeof record.offset === 'number' &&
    Number.isInteger(record.offset) &&
    record.offset >= 0 &&
    typeof record.limit === 'number' &&
    Number.isInteger(record.limit) &&
    record.limit >= 0
  );
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

  async listFinancialTransactions(
    options?: AsaasListFinancialTransactionsOptions,
  ): Promise<AsaasFinancialTransactionPage> {
    const query = this.buildFinancialTransactionsQuery(options);

    const response = await this.rawFetch(`/financialTransactions${query}`, {
      method: 'GET',
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      throw await this.toClientError(response);
    }

    const data = await this.parseJson<unknown>(response);

    if (!isAsaasFinancialTransactionPageResponse(data)) {
      throw new AsaasClientError({
        code: 'unknown',
        message: 'Asaas financial transactions response had an unexpected shape',
      });
    }

    const items: AsaasFinancialTransaction[] = [];

    for (const item of data.data) {
      if (!isAsaasFinancialTransaction(item)) {
        throw new AsaasClientError({
          code: 'unknown',
          message: 'Asaas financial transactions response contained an invalid item',
        });
      }

      items.push({
        id: item.id,
        value: item.value,
        type: item.type,
        date: item.date,
        balance: item.balance ?? null,
        description: item.description ?? null,
        paymentId: item.paymentId ?? null,
        transferId: item.transferId ?? null,
        billId: item.billId ?? null,
      });
    }

    return {
      data: items,
      totalCount: data.totalCount,
      hasMore: data.hasMore,
      offset: data.offset,
      limit: data.limit,
    };
  }

  async simulateBillPayment(input: AsaasSimulateBillPaymentInput): Promise<AsaasBillSimulation> {
    const identificationField = input.identificationField.trim();

    if (identificationField.length === 0) {
      throw new AsaasClientError({
        code: 'unknown',
        message: 'Asaas bill simulation requires a non-empty identificationField',
      });
    }

    const response = await this.rawFetch('/bill/simulate', {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ identificationField }),
    });

    if (!response.ok) {
      throw await this.toBillSimulationClientError(response);
    }

    const data = await this.parseJson<unknown>(response);

    if (!isAsaasBillSimulationResponse(data)) {
      throw new AsaasClientError({
        code: 'unknown',
        message: 'Asaas bill simulation response had an unexpected shape',
      });
    }

    return {
      value: data.bankSlipInfo.value,
      dueDate: data.bankSlipInfo.dueDate,
      originalValue: data.bankSlipInfo.originalValue ?? null,
      isOverdue: data.bankSlipInfo.isOverdue ?? null,
      allowChangeValue: data.bankSlipInfo.allowChangeValue ?? null,
      minValue: data.bankSlipInfo.minValue ?? null,
      maxValue: data.bankSlipInfo.maxValue ?? null,
      beneficiaryName: data.bankSlipInfo.beneficiaryName ?? null,
      companyName: data.bankSlipInfo.companyName ?? null,
      fee: data.fee ?? null,
      minimumScheduleDate: data.minimumScheduleDate ?? null,
    };
  }

  private buildFinancialTransactionsQuery(options?: AsaasListFinancialTransactionsOptions): string {
    if (!options) return '';

    const params = new URLSearchParams();

    if (options.offset !== undefined) {
      if (!Number.isInteger(options.offset) || options.offset < 0) {
        throw new AsaasClientError({
          code: 'unknown',
          message: 'Asaas financial transactions offset must be a non-negative integer',
        });
      }
      params.set('offset', String(options.offset));
    }

    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
        throw new AsaasClientError({
          code: 'unknown',
          message: 'Asaas financial transactions limit must be an integer between 1 and 100',
        });
      }
      params.set('limit', String(options.limit));
    }

    if (options.startDate !== undefined) {
      if (!isValidAsaasDateString(options.startDate)) {
        throw new AsaasClientError({
          code: 'unknown',
          message: 'Asaas financial transactions startDate must be in YYYY-MM-DD format',
        });
      }
      params.set('startDate', options.startDate);
    }

    if (options.finishDate !== undefined) {
      if (!isValidAsaasDateString(options.finishDate)) {
        throw new AsaasClientError({
          code: 'unknown',
          message: 'Asaas financial transactions finishDate must be in YYYY-MM-DD format',
        });
      }
      params.set('finishDate', options.finishDate);
    }

    if (options.order !== undefined) {
      if (options.order !== 'asc' && options.order !== 'desc') {
        throw new AsaasClientError({
          code: 'unknown',
          message: 'Asaas financial transactions order must be asc or desc',
        });
      }
      params.set('order', options.order);
    }

    const query = params.toString();
    return query.length > 0 ? `?${query}` : '';
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

  // 400 on /bill/simulate means Asaas rejected the identificationField/barcode itself
  // (invalid or unrecognized bill) rather than a generic client bug, so it is classified
  // separately from the shared classifyAsaasError mapping (which the other endpoints don't
  // expect to see 400 from).
  private async toBillSimulationClientError(response: Response): Promise<AsaasClientError> {
    if (response.status === 400) {
      return new AsaasClientError({
        code: 'invalid_request',
        message: 'Asaas rejected the bill simulation request',
      });
    }

    return this.toClientError(response);
  }
}
