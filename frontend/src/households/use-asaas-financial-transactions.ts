import { useQuery } from '@tanstack/react-query';

import { listAsaasFinancialTransactions } from './asaas-api';

export function asaasFinancialTransactionsQueryKey(householdId: string | undefined) {
  return ['asaas', householdId, 'financial-transactions'] as const;
}

export function useAsaasFinancialTransactions(householdId: string | undefined) {
  return useQuery({
    queryKey: asaasFinancialTransactionsQueryKey(householdId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to load the Asaas statement.');
      }

      return listAsaasFinancialTransactions(householdId);
    },
    enabled: householdId !== undefined,
  });
}
