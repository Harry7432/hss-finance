import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest } from '../lib/http';
import { monetaryAmountSchema } from './household-api';

const monthlySummaryEntrySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  totalIncome: monetaryAmountSchema,
  totalExpense: monetaryAmountSchema,
  balance: monetaryAmountSchema,
});

export type MonthlySummaryEntry = z.infer<typeof monthlySummaryEntrySchema>;

export function monthlySummaryQueryKey(householdId: string | undefined) {
  return ['household-monthly-summary', householdId] as const;
}

export async function getHouseholdMonthlySummary(
  householdId: string,
): Promise<MonthlySummaryEntry[]> {
  const result = await apiRequest<unknown>(`/households/${householdId}/summary/monthly`);
  const parsedResult = z.array(monthlySummaryEntrySchema).safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}
