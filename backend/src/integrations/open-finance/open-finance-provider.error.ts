export type OpenFinanceProviderErrorCode =
  | 'authentication'
  | 'unavailable'
  | 'rate_limit'
  | 'invalid_connection'
  | 'consent_expired'
  | 'unknown';

export interface OpenFinanceProviderErrorInput {
  provider: string;
  code: OpenFinanceProviderErrorCode;
  message: string;
  cause?: unknown;
}

export class OpenFinanceProviderError extends Error {
  readonly provider: string;
  readonly code: OpenFinanceProviderErrorCode;

  constructor({ provider, code, message, cause }: OpenFinanceProviderErrorInput) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'OpenFinanceProviderError';
    this.provider = provider;
    this.code = code;
  }
}

export class OpenFinanceProviderNotFoundError extends Error {
  constructor(providerName: string) {
    super(`Open finance provider "${providerName}" not found`);
    this.name = 'OpenFinanceProviderNotFoundError';
  }
}

export class OpenFinanceProviderAlreadyRegisteredError extends Error {
  constructor(providerName: string) {
    super(`Open finance provider "${providerName}" is already registered`);
    this.name = 'OpenFinanceProviderAlreadyRegisteredError';
  }
}
