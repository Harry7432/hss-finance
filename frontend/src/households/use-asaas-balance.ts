import { useQuery } from '@tanstack/react-query';

import { getAsaasBalance } from './asaas-api';

export function asaasBalanceQueryKey(householdId: string | undefined) {
  return ['asaas', householdId, 'balance'] as const;
}

export function useAsaasBalance(householdId: string | undefined) {
  return useQuery({
    queryKey: asaasBalanceQueryKey(householdId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to load the Asaas balance.');
      }

      return getAsaasBalance(householdId);
    },
    enabled: householdId !== undefined,
  });
}
