import { useQuery } from '@tanstack/react-query';

import { householdsQueryKey, listHouseholds } from './household-api';

export function useHouseholds() {
  return useQuery({
    queryKey: householdsQueryKey,
    queryFn: listHouseholds,
  });
}
