import { useMutation, useQueryClient } from '@tanstack/react-query';

import { payBill } from './asaas-api';
import { paymentAttemptQueryKey } from './use-payment-attempt';

export function usePayBill(householdId: string | undefined, transactionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (identificationField: string) => {
      if (!householdId) {
        throw new Error('householdId is required to pay a bill.');
      }

      return payBill(householdId, transactionId, identificationField);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: paymentAttemptQueryKey(householdId, transactionId),
      });
    },
  });
}
