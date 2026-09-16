import { NavLink } from 'react-router';

import { cn } from '../../lib/cn';
import type { NavItem } from './nav-items';

interface NavListProps {
  items: NavItem[];
  onNavigate?: () => void;
}

export function NavList({ items, onNavigate }: NavListProps) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.label}>
          {item.to ? (
            <NavLink
              to={item.to}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand text-on-brand'
                    : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                )
              }
            >
              {item.label}
            </NavLink>
          ) : (
            <span
              aria-disabled="true"
              className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-muted/50"
            >
              {item.label}
              <span className="ml-2 text-xs">(em breve)</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
