import { useHouseholds } from './use-households';

/**
 * Single source of truth for "the active household": the first household
 * returned for the authenticated user. Both the financial summary and the
 * upcoming payments section must derive the active household from this hook
 * so they never disagree on which household is in view.
 */
export function useActiveHousehold() {
  const householdsQuery = useHouseholds();

  return {
    householdsQuery,
    activeHousehold: householdsQuery.data?.[0],
  };
}
