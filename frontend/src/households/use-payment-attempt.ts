import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { getPaymentAttempt } from './asaas-api';
import { isTerminalPaymentAttemptStatus } from './select-asaas';

export function paymentAttemptQueryKey(householdId: string | undefined, transactionId: string) {
  return ['asaas', householdId, 'transactions', transactionId, 'payment-attempt'] as const;
}

const POLL_INTERVAL_MS = 6000;
// Bounded window: a payment attempt that is still 'requested'/'processing' after this long
// stops being polled automatically — the backend, not the frontend, is the authority on
// whether it eventually resolves, and endless client-side polling is never appropriate.
const POLL_WINDOW_MS = 2 * 60 * 1000;

export function usePaymentAttempt(
  householdId: string | undefined,
  transactionId: string,
  options: { poll: boolean },
) {
  const pollingStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (options.poll && pollingStartedAtRef.current === null) {
      pollingStartedAtRef.current = Date.now();
    }
  }, [options.poll]);

  return useQuery({
    queryKey: paymentAttemptQueryKey(householdId, transactionId),
    queryFn: () => {
      if (!householdId) {
        throw new Error('householdId is required to load a payment attempt.');
      }

      return getPaymentAttempt(householdId, transactionId);
    },
    enabled: householdId !== undefined,
    refetchInterval: (query) => {
      if (!options.poll) {
        return false;
      }

      const data = query.state.data;

      if (data && isTerminalPaymentAttemptStatus(data.status)) {
        return false;
      }

      const startedAt = pollingStartedAtRef.current;

      if (startedAt !== null && Date.now() - startedAt > POLL_WINDOW_MS) {
        return false;
      }

      return POLL_INTERVAL_MS;
    },
  });
}
