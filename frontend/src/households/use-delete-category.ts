import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteCategory, householdCategoriesQueryKey } from './category-api';

export function useDeleteCategory(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => {
      if (!householdId) {
        throw new Error('householdId is required to delete a category.');
      }

      return deleteCategory(householdId, categoryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdCategoriesQueryKey(householdId) });
    },
  });
}
