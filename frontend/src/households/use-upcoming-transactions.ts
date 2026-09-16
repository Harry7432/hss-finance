import { useQuery } from '@tanstack/react-query';

import { getUpcomingTransactionCandidates, upcomingTransactionsQueryKey } from './transaction-api';

export function useUpcomingTransactions(householdId: string | undefined) {
  return useQuery({
    queryKey: upcomingTransactionsQueryKey(householdId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to fetch upcoming transactions.');
      }

      return getUpcomingTransactionCandidates(householdId);
    },
    enabled: householdId !== undefined,
  });
}
