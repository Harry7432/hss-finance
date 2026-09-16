import { useQuery } from '@tanstack/react-query';

import {
  listTransactions,
  transactionsQueryKey,
  type TransactionListParams,
} from './transaction-api';

export function useTransactions(householdId: string | undefined, params: TransactionListParams) {
  return useQuery({
    queryKey: transactionsQueryKey(householdId, params),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to fetch transactions.');
      }

      return listTransactions(householdId, params);
    },
    enabled: householdId !== undefined,
  });
}
