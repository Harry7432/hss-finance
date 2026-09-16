import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest } from '../lib/http';
import { monetaryAmountSchema } from './household-api';

const categorySummaryEntrySchema = z.object({
  categoryId: z.uuid().nullable(),
  categoryName: z.string(),
  totalExpense: monetaryAmountSchema,
});

export type CategorySummaryEntry = z.infer<typeof categorySummaryEntrySchema>;

export function categorySummaryQueryKey(
  householdId: string | undefined,
  startDate: string,
  endDate: string,
) {
  return ['household-category-summary', householdId, startDate, endDate] as const;
}

export async function getHouseholdCategorySummary(
  householdId: string,
  startDate: string,
  endDate: string,
): Promise<CategorySummaryEntry[]> {
  const query = new URLSearchParams({ startDate, endDate });
  const result = await apiRequest<unknown>(
    `/households/${householdId}/summary/categories?${query.toString()}`,
  );
  const parsedResult = z.array(categorySummaryEntrySchema).safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}
