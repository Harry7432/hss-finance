import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest } from '../lib/http';

export const authQueryKey = ['auth', 'me'] as const;

const authUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  createdAt: z.iso.datetime(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export interface LoginInput {
  email: string;
  password: string;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const user = await apiRequest<unknown>('/auth/me');
  const parsedUser = authUserSchema.safeParse(user);

  if (!parsedUser.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedUser.data;
}

export async function login(input: LoginInput): Promise<void> {
  await apiRequest('/auth/login', { method: 'POST', body: input });
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' });
}
