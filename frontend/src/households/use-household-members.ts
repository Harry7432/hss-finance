import { useQuery } from '@tanstack/react-query';

import { householdMembersQueryKey, listHouseholdMembers } from './household-member-api';

export function useHouseholdMembers(householdId: string | undefined) {
  return useQuery({
    queryKey: householdMembersQueryKey(householdId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to fetch household members.');
      }

      return listHouseholdMembers(householdId);
    },
    enabled: householdId !== undefined,
  });
}
