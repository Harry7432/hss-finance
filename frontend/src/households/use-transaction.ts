import { useQuery } from '@tanstack/react-query';

import { getTransaction } from './transaction-api';

export function transactionQueryKey(householdId: string | undefined, transactionId: string) {
  return ['transactions', householdId, 'detail', transactionId] as const;
}

export function useTransaction(householdId: string | undefined, transactionId: string) {
  return useQuery({
    queryKey: transactionQueryKey(householdId, transactionId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to load a transaction.');
      }

      return getTransaction(householdId, transactionId);
    },
    enabled: householdId !== undefined,
  });
}
