import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  addHouseholdMember,
  householdMembersQueryKey,
  type AddHouseholdMemberInput,
} from './household-member-api';

export function useAddHouseholdMember(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddHouseholdMemberInput) => {
      if (!householdId) {
        throw new Error('householdId is required to add a household member.');
      }

      return addHouseholdMember(householdId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdMembersQueryKey(householdId) });
    },
  });
}
