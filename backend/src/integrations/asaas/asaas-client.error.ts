export type AsaasClientErrorCode =
  'authentication' | 'rate_limit' | 'unavailable' | 'invalid_request' | 'unknown';

export interface AsaasClientErrorInput {
  code: AsaasClientErrorCode;
  message: string;
  cause?: unknown;
}

export class AsaasClientError extends Error {
  readonly code: AsaasClientErrorCode;

  constructor({ code, message, cause }: AsaasClientErrorInput) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AsaasClientError';
    this.code = code;
  }
}
