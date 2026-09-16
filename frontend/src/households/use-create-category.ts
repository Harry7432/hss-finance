import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createCategory,
  householdCategoriesQueryKey,
  type CreateCategoryInput,
} from './category-api';

export function useCreateCategory(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCategoryInput) => {
      if (!householdId) {
        throw new Error('householdId is required to create a category.');
      }

      return createCategory(householdId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdCategoriesQueryKey(householdId) });
    },
  });
}
