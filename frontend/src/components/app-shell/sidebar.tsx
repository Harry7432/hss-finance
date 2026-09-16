import { BrandMark } from '../brand/brand-mark';
import { LogoutButton } from './logout-button';
import { NavList } from './nav-list';
import { navItems } from './nav-items';
import { useLogout } from './use-logout';

export function Sidebar() {
  const { logout, isLoggingOut } = useLogout();

  return (
    <aside className="hidden border-r border-line/15 bg-page-deep lg:flex lg:flex-col lg:justify-between lg:px-5 lg:py-6">
      <div>
        <BrandMark size="sm" />
        <nav aria-label="Navegação principal" className="mt-8">
          <NavList items={navItems} />
        </nav>
      </div>
      <LogoutButton onLogout={logout} isLoggingOut={isLoggingOut} />
    </aside>
  );
}
