import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  householdCategoriesQueryKey,
  updateCategory,
  type UpdateCategoryInput,
} from './category-api';

export function useUpdateCategory(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoryId, input }: { categoryId: string; input: UpdateCategoryInput }) => {
      if (!householdId) {
        throw new Error('householdId is required to update a category.');
      }

      return updateCategory(householdId, categoryId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdCategoriesQueryKey(householdId) });
      queryClient.invalidateQueries({ queryKey: ['household-category-summary', householdId] });
    },
  });
}
