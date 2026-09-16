import { useQuery } from '@tanstack/react-query';

import { getHouseholdMonthlySummary, monthlySummaryQueryKey } from './monthly-summary-api';

export function useHouseholdMonthlySummary(householdId: string | undefined) {
  return useQuery({
    queryKey: monthlySummaryQueryKey(householdId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to fetch the household monthly summary.');
      }

      return getHouseholdMonthlySummary(householdId);
    },
    enabled: householdId !== undefined,
  });
}
