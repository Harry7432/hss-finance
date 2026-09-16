import { useRef, useState } from 'react';
import { Outlet } from 'react-router';

import { AppHeader } from './app-header';
import { MobileNavigation } from './mobile-navigation';
import { Sidebar } from './sidebar';

export function AppShell() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div data-theme="dark" className="min-h-svh bg-page lg:grid lg:grid-cols-[240px_1fr]">
      <Sidebar />

      <div className="flex min-h-svh flex-col">
        <AppHeader onOpenMobileNav={() => setIsMobileNavOpen(true)} menuButtonRef={menuButtonRef} />

        <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>

      <MobileNavigation
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        triggerRef={menuButtonRef}
      />
    </div>
  );
}
