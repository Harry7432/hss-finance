import { useQuery } from '@tanstack/react-query';

import { householdCategoriesQueryKey, listHouseholdCategories } from './category-api';

export function useHouseholdCategories(householdId: string | undefined) {
  return useQuery({
    queryKey: householdCategoriesQueryKey(householdId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to fetch household categories.');
      }

      return listHouseholdCategories(householdId);
    },
    enabled: householdId !== undefined,
  });
}
