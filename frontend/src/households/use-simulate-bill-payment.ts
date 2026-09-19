import { useMutation } from '@tanstack/react-query';

import { simulateBillPayment } from './asaas-api';

export function useSimulateBillPayment(householdId: string | undefined, transactionId: string) {
  return useMutation({
    mutationFn: (identificationField: string) => {
      if (!householdId) {
        throw new Error('householdId is required to simulate a bill payment.');
      }

      return simulateBillPayment(householdId, transactionId, identificationField);
    },
  });
}
