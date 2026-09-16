import { useEffect, useRef, type RefObject } from 'react';

import { LogoutButton } from './logout-button';
import { NavList } from './nav-list';
import { navItems } from './nav-items';
import { useLogout } from './use-logout';

interface MobileNavigationProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled])';

export function MobileNavigation({ isOpen, onClose, triggerRef }: MobileNavigationProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { logout, isLoggingOut } = useLogout();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const triggerElement = triggerRef.current;
    const panel = panelRef.current;
    const focusable = panel
      ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : [];
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerElement?.focus();
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        data-testid="mobile-nav-backdrop"
        className="absolute inset-0 bg-page-deep/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col justify-between overflow-y-auto bg-page-deep px-5 py-6 shadow-xl"
      >
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink-muted">Menu</p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-line/25 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-alt"
            >
              Fechar
            </button>
          </div>
          <nav aria-label="Navegação principal" className="mt-8">
            <NavList items={navItems} onNavigate={onClose} />
          </nav>
        </div>
        <LogoutButton onLogout={logout} isLoggingOut={isLoggingOut} />
      </div>
    </div>
  );
}
