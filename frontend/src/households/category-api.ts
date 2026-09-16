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

export interface CreateCategoryInput {
  name: string;
  type: 'income' | 'expense';
}

export async function createCategory(
  householdId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  const result = await apiRequest<unknown>(`/households/${householdId}/categories`, {
    method: 'POST',
    body: { name: input.name, type: input.type },
  });
  const parsedResult = categorySchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(201, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

export interface UpdateCategoryInput {
  name: string;
}

export async function updateCategory(
  householdId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const result = await apiRequest<unknown>(`/households/${householdId}/categories/${categoryId}`, {
    method: 'PATCH',
    body: { name: input.name },
  });
  const parsedResult = categorySchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

export async function deleteCategory(householdId: string, categoryId: string): Promise<void> {
  await apiRequest<void>(`/households/${householdId}/categories/${categoryId}`, {
    method: 'DELETE',
  });
}
