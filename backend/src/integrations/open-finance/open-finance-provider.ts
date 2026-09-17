export type OpenFinanceConnectionStatus =
  'pending' | 'connected' | 'error' | 'expired' | 'disconnected';

export type OpenFinanceAccountType =
  'checking' | 'savings' | 'credit_card' | 'investment' | 'other';

export type OpenFinanceTransactionType = 'income' | 'expense';

/**
 * Status of a transaction at the provider/institution, not to be confused with
 * TransactionEntity.status ('pending' | 'paid'), which tracks whether the household
 * has settled the transaction. A bank transaction can be posted while still unpaid
 * from the household's point of view, so the two statuses are intentionally decoupled.
 */
export type OpenFinanceTransactionStatus = 'pending' | 'posted';

export interface ProviderConnectSession {
  token: string;
  expiresAt?: Date;
}

export interface ProviderConnection {
  externalId: string;
  institutionId: string;
  institutionName: string;
  status: OpenFinanceConnectionStatus;
  consentExpiresAt: Date | null;
}

export interface ProviderAccount {
  externalId: string;
  type: OpenFinanceAccountType;
  subtype: string | null;
  name: string;
  currencyCode: string;
  balance: string | null;
  balanceUpdatedAt: Date | null;
  maskedNumber: string | null;
}

export interface ProviderTransaction {
  externalId: string | null;
  type: OpenFinanceTransactionType;
  amount: string;
  description: string;
  date: string;
  status: OpenFinanceTransactionStatus;
  categoryHint: string | null;
}

export interface ProviderTransactionPage {
  items: ProviderTransaction[];
  nextCursor: string | null;
}

export interface CreateConnectSessionInput {
  externalConnectionId?: string | null;
}

export interface ListProviderTransactionsInput {
  accountExternalId: string;
  cursor?: string;
  from?: string;
  to?: string;
}

export interface OpenFinanceProvider {
  readonly name: string;

  createConnectSession(input: CreateConnectSessionInput): Promise<ProviderConnectSession>;

  getConnection(externalConnectionId: string): Promise<ProviderConnection>;

  listAccounts(externalConnectionId: string): Promise<ProviderAccount[]>;

  listTransactions(input: ListProviderTransactionsInput): Promise<ProviderTransactionPage>;

  refreshConnection?(externalConnectionId: string): Promise<void>;

  disconnectConnection(externalConnectionId: string): Promise<void>;
}
