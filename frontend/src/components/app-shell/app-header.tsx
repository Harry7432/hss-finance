import type { RefObject } from 'react';
import { useLocation } from 'react-router';

import { navItems } from './nav-items';
import { UserMenu } from './user-menu';

interface AppHeaderProps {
  onOpenMobileNav: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}

function resolvePageTitle(pathname: string): string {
  return navItems.find((item) => item.to === pathname)?.label ?? 'Dashboard';
}

export function AppHeader({ onOpenMobileNav, menuButtonRef }: AppHeaderProps) {
  const location = useLocation();
  const pageTitle = resolvePageTitle(location.pathname);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-line/15 bg-page px-5 py-4 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenMobileNav}
          className="min-h-11 rounded-lg border border-line/25 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-alt lg:hidden"
        >
          Menu
        </button>
        <p className="text-lg font-semibold text-ink">{pageTitle}</p>
      </div>

      <UserMenu />
    </header>
  );
}
