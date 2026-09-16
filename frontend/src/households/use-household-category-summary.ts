import { useQuery } from '@tanstack/react-query';

import { categorySummaryQueryKey, getHouseholdCategorySummary } from './category-summary-api';

export function useHouseholdCategorySummary(
  householdId: string | undefined,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: categorySummaryQueryKey(householdId, startDate, endDate),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to fetch the household category summary.');
      }

      return getHouseholdCategorySummary(householdId, startDate, endDate);
    },
    enabled: householdId !== undefined,
  });
}
