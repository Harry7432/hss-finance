import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createTransaction, type CreateTransactionInput } from './transaction-api';

export function useCreateTransaction(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTransactionInput) => {
      if (!householdId) {
        throw new Error('householdId is required to create a transaction.');
      }

      return createTransaction(householdId, input);
    },
    onSuccess: () => {
      if (!householdId) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['transactions', householdId] });
      queryClient.invalidateQueries({ queryKey: ['household-summary', householdId] });
      queryClient.invalidateQueries({ queryKey: ['household-category-summary', householdId] });
      queryClient.invalidateQueries({ queryKey: ['household-monthly-summary', householdId] });
    },
  });
}
