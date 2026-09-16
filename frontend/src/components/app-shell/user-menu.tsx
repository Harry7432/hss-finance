import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth/auth-context';
import { LogoutButton } from './logout-button';
import { useLogout } from './use-logout';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';

  return `${first}${last}`.toUpperCase();
}

export function UserMenu() {
  const auth = useAuth();
  const { logout, isLoggingOut } = useLogout();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!auth.user) {
    return null;
  }

  const { name, email } = auth.user;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-alt"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-on-brand"
        >
          {getInitials(name)}
        </span>
        <span className="hidden text-sm font-medium text-ink sm:inline">{name}</span>
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Menu do usuário"
          className="absolute right-0 z-10 mt-2 w-52 rounded-lg border border-line/20 bg-surface p-2 shadow-xl"
        >
          <p className="truncate px-2 py-1 text-xs text-ink-muted">{email}</p>
          <LogoutButton onLogout={logout} isLoggingOut={isLoggingOut} className="w-full" />
        </div>
      ) : null}
    </div>
  );
}
