import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { ApiError } from '../lib/api-error';
import { clearAccessTokenProvider } from '../lib/http';
import { authQueryKey, getCurrentUser, login, logout, type AuthUser } from './auth-api';
import { AuthContext, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: authQueryKey,
    queryFn: getCurrentUser,
  });
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authQueryKey, exact: true }),
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      clearAccessTokenProvider();
      await queryClient.cancelQueries({ queryKey: authQueryKey, exact: true });
      queryClient.setQueryData<AuthUser | null>(authQueryKey, null);
    },
  });
  const sessionRejected =
    session.error instanceof ApiError &&
    (session.error.status === 401 || session.error.status === 403);
  const status: AuthStatus = session.isPending
    ? 'loading'
    : sessionRejected
      ? 'unauthenticated'
      : session.isError
        ? 'error'
        : session.data
          ? 'authenticated'
          : 'unauthenticated';
  const user = status === 'authenticated' ? (session.data ?? null) : null;

  return (
    <AuthContext
      value={{
        status,
        user,
        login: async (input) => {
          await loginMutation.mutateAsync(input);
        },
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
        retry: async () => {
          await session.refetch();
        },
      }}
    >
      {children}
    </AuthContext>
  );
}
