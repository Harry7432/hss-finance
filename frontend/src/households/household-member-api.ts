import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest } from '../lib/http';

export function householdMembersQueryKey(householdId: string | undefined) {
  return ['household-members', householdId] as const;
}

const householdMemberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(['owner', 'member']),
  joinedAt: z.iso.datetime(),
});

export type HouseholdMember = z.infer<typeof householdMemberSchema>;

export async function listHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  const result = await apiRequest<unknown>(`/households/${householdId}/members`);
  const parsedResult = z.array(householdMemberSchema).safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

export interface AddHouseholdMemberInput {
  email: string;
}

export async function addHouseholdMember(
  householdId: string,
  input: AddHouseholdMemberInput,
): Promise<HouseholdMember> {
  const result = await apiRequest<unknown>(`/households/${householdId}/members`, {
    method: 'POST',
    body: { email: input.email },
  });
  const parsedResult = householdMemberSchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(201, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}
