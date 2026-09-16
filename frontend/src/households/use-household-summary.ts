import { useQuery } from '@tanstack/react-query';

import { getHouseholdSummary, householdSummaryQueryKey } from './household-api';

export function useHouseholdSummary(householdId: string | undefined) {
  return useQuery({
    queryKey: householdSummaryQueryKey(householdId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to fetch the household summary.');
      }

      return getHouseholdSummary(householdId);
    },
    enabled: householdId !== undefined,
  });
}
