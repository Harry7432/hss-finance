import { useState } from 'react';

import { useAuth } from '../../auth/auth-context';

export function useLogout() {
  const auth = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  function logout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    auth
      .logout()
      .catch(() => undefined)
      .finally(() => setIsLoggingOut(false));
  }

  return { logout, isLoggingOut };
}
