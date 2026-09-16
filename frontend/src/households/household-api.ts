import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest } from '../lib/http';

export const householdsQueryKey = ['households'] as const;

export function householdSummaryQueryKey(householdId: string | undefined) {
  return ['household-summary', householdId] as const;
}

const householdSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  currencyCode: z.string(),
  role: z.enum(['owner', 'member']),
  createdAt: z.iso.datetime(),
});

export type Household = z.infer<typeof householdSchema>;

export const monetaryAmountSchema = z.string().regex(/^-?\d+\.\d{2}$/);

const householdSummarySchema = z.object({
  totalIncome: monetaryAmountSchema,
  totalExpense: monetaryAmountSchema,
  balance: monetaryAmountSchema,
});

export type HouseholdSummary = z.infer<typeof householdSummarySchema>;

export async function listHouseholds(): Promise<Household[]> {
  const households = await apiRequest<unknown>('/households');
  const parsedHouseholds = z.array(householdSchema).safeParse(households);

  if (!parsedHouseholds.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedHouseholds.data;
}

export async function getHouseholdSummary(householdId: string): Promise<HouseholdSummary> {
  const summary = await apiRequest<unknown>(`/households/${householdId}/summary`);
  const parsedSummary = householdSummarySchema.safeParse(summary);

  if (!parsedSummary.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedSummary.data;
}
