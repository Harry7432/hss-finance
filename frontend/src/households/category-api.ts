import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest } from '../lib/http';

const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(['income', 'expense']),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Category = z.infer<typeof categorySchema>;

export function householdCategoriesQueryKey(householdId: string | undefined) {
  return ['household-categories', householdId] as const;
}

export async function listHouseholdCategories(householdId: string): Promise<Category[]> {
  const result = await apiRequest<unknown>(`/households/${householdId}/categories`);
  const parsedResult = z.array(categorySchema).safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}
