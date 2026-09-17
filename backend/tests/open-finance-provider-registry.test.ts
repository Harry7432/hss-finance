import { OpenFinanceProviderRegistry } from '../src/integrations/open-finance/open-finance-provider-registry.js';
import {
  OpenFinanceProviderAlreadyRegisteredError,
  OpenFinanceProviderNotFoundError,
} from '../src/integrations/open-finance/open-finance-provider.error.js';
import type {
  CreateConnectSessionInput,
  ListProviderTransactionsInput,
  OpenFinanceProvider,
  ProviderAccount,
  ProviderConnectSession,
  ProviderConnection,
  ProviderTransactionPage,
} from '../src/integrations/open-finance/open-finance-provider.js';

class FakeOpenFinanceProvider implements OpenFinanceProvider {
  constructor(readonly name: string) {}

  async createConnectSession(_input: CreateConnectSessionInput): Promise<ProviderConnectSession> {
    return { token: `fake-token-${this.name}` };
  }

  async getConnection(externalConnectionId: string): Promise<ProviderConnection> {
    return {
      externalId: externalConnectionId,
      institutionId: 'inst-1',
      institutionName: 'Fake Bank',
      status: 'connected',
      consentExpiresAt: null,
    };
  }

  async listAccounts(_externalConnectionId: string): Promise<ProviderAccount[]> {
    return [];
  }

  async listTransactions(_input: ListProviderTransactionsInput): Promise<ProviderTransactionPage> {
    return { items: [], nextCursor: null };
  }

  async disconnectConnection(_externalConnectionId: string): Promise<void> {}
}

describe('OpenFinanceProviderRegistry', () => {
  it('registers and resolves a provider by name', () => {
    const registry = new OpenFinanceProviderRegistry();
    const provider = new FakeOpenFinanceProvider('fake');

    registry.register(provider);

    expect(registry.get('fake')).toBe(provider);
  });

  it('resolves lookups case-insensitively', () => {
    const registry = new OpenFinanceProviderRegistry();
    const provider = new FakeOpenFinanceProvider('Fake');

    registry.register(provider);

    expect(registry.get('fake')).toBe(provider);
    expect(registry.get('FAKE')).toBe(provider);
  });

  it('throws a controlled error when the provider is not registered', () => {
    const registry = new OpenFinanceProviderRegistry();

    expect(() => registry.get('missing')).toThrow(OpenFinanceProviderNotFoundError);
  });

  it('rejects registering the same provider name twice', () => {
    const registry = new OpenFinanceProviderRegistry();
    registry.register(new FakeOpenFinanceProvider('fake'));

    expect(() => registry.register(new FakeOpenFinanceProvider('fake'))).toThrow(
      OpenFinanceProviderAlreadyRegisteredError,
    );
  });

  it('rejects duplicate registration regardless of name casing', () => {
    const registry = new OpenFinanceProviderRegistry();
    registry.register(new FakeOpenFinanceProvider('fake'));

    expect(() => registry.register(new FakeOpenFinanceProvider('FAKE'))).toThrow(
      OpenFinanceProviderAlreadyRegisteredError,
    );
  });

  it('allows two different providers to coexist', () => {
    const registry = new OpenFinanceProviderRegistry();
    const providerA = new FakeOpenFinanceProvider('provider-a');
    const providerB = new FakeOpenFinanceProvider('provider-b');

    registry.register(providerA);
    registry.register(providerB);

    expect(registry.get('provider-a')).toBe(providerA);
    expect(registry.get('provider-b')).toBe(providerB);
  });
});
