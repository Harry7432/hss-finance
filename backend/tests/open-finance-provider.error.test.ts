import {
  OpenFinanceProviderAlreadyRegisteredError,
  OpenFinanceProviderError,
  OpenFinanceProviderNotFoundError,
} from '../src/integrations/open-finance/open-finance-provider.error.js';

describe('OpenFinanceProviderError', () => {
  it('preserves the normalized code and provider name', () => {
    const error = new OpenFinanceProviderError({
      provider: 'fake',
      code: 'rate_limit',
      message: 'Too many requests',
    });

    expect(error.code).toBe('rate_limit');
    expect(error.provider).toBe('fake');
    expect(error.name).toBe('OpenFinanceProviderError');
    expect(error.message).toBe('Too many requests');
  });

  it('keeps an optional cause without requiring one', () => {
    const cause = new Error('upstream timeout');

    const withCause = new OpenFinanceProviderError({
      provider: 'fake',
      code: 'unavailable',
      message: 'Provider unavailable',
      cause,
    });
    const withoutCause = new OpenFinanceProviderError({
      provider: 'fake',
      code: 'unavailable',
      message: 'Provider unavailable',
    });

    expect(withCause.cause).toBe(cause);
    expect(withoutCause.cause).toBeUndefined();
  });

  it('never includes credentials or tokens in the message', () => {
    const error = new OpenFinanceProviderError({
      provider: 'fake',
      code: 'authentication',
      message: 'Authentication failed',
    });

    expect(error.message).not.toMatch(/token|password|secret/i);
  });
});

describe('OpenFinanceProviderNotFoundError', () => {
  it('names the missing provider in the message', () => {
    const error = new OpenFinanceProviderNotFoundError('belvo');

    expect(error.name).toBe('OpenFinanceProviderNotFoundError');
    expect(error.message).toContain('belvo');
  });
});

describe('OpenFinanceProviderAlreadyRegisteredError', () => {
  it('names the duplicated provider in the message', () => {
    const error = new OpenFinanceProviderAlreadyRegisteredError('pluggy');

    expect(error.name).toBe('OpenFinanceProviderAlreadyRegisteredError');
    expect(error.message).toContain('pluggy');
  });
});
