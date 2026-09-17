import type {
  CreateConnectSessionInput,
  ListProviderTransactionsInput,
  OpenFinanceProvider,
  ProviderAccount,
  ProviderConnectSession,
  ProviderConnection,
  ProviderTransaction,
  ProviderTransactionPage,
} from '../src/integrations/open-finance/open-finance-provider.js';

const ALL_TRANSACTIONS: ProviderTransaction[] = [
  {
    externalId: 'tx-1',
    type: 'expense',
    amount: '10.00',
    description: 'Coffee',
    date: '2026-09-01',
    status: 'posted',
    categoryHint: null,
  },
  {
    externalId: 'tx-2',
    type: 'income',
    amount: '2000.00',
    description: 'Salary',
    date: '2026-09-05',
    status: 'pending',
    categoryHint: 'salary',
  },
];

class FakeOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = 'fake';

  async createConnectSession(input: CreateConnectSessionInput): Promise<ProviderConnectSession> {
    return {
      token: 'fake-connect-token',
      ...(input.externalConnectionId ? { expiresAt: new Date('2026-09-16T12:00:00.000Z') } : {}),
    };
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
    return [
      {
        externalId: 'acc-1',
        type: 'checking',
        subtype: null,
        name: 'Fake Checking',
        currencyCode: 'BRL',
        balance: '100.00',
        balanceUpdatedAt: null,
        maskedNumber: '**** 1234',
      },
    ];
  }

  async listTransactions(input: ListProviderTransactionsInput): Promise<ProviderTransactionPage> {
    const cursorIndex = input.cursor ? Number(input.cursor) : 0;
    const items = ALL_TRANSACTIONS.slice(cursorIndex, cursorIndex + 1);
    const nextIndex = cursorIndex + 1;

    return {
      items,
      nextCursor: nextIndex < ALL_TRANSACTIONS.length ? String(nextIndex) : null,
    };
  }

  async disconnectConnection(_externalConnectionId: string): Promise<void> {}
}

describe('OpenFinanceProvider contract', () => {
  it('is satisfied by a fake implementation with no provider-specific types', async () => {
    const provider = new FakeOpenFinanceProvider();

    const session = await provider.createConnectSession({});
    const connection = await provider.getConnection('conn-1');
    const accounts = await provider.listAccounts('conn-1');

    expect(session.token).toBe('fake-connect-token');
    expect(connection.status).toBe('connected');
    expect(accounts).toHaveLength(1);
  });

  it('paginates transactions with a cursor', async () => {
    const provider = new FakeOpenFinanceProvider();

    const firstPage = await provider.listTransactions({ accountExternalId: 'acc-1' });

    expect(firstPage.items).toEqual([ALL_TRANSACTIONS[0]]);
    expect(firstPage.nextCursor).toBe('1');

    const secondPage = await provider.listTransactions({
      accountExternalId: 'acc-1',
      ...(firstPage.nextCursor ? { cursor: firstPage.nextCursor } : {}),
    });

    expect(secondPage.items).toEqual([ALL_TRANSACTIONS[1]]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('represents the end of pagination without a cursor', async () => {
    const provider = new FakeOpenFinanceProvider();

    const lastPage = await provider.listTransactions({
      accountExternalId: 'acc-1',
      cursor: '1',
    });

    expect(lastPage.nextCursor).toBeNull();
  });
});
