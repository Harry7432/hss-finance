import type { PropsWithChildren, ReactNode } from 'react';

import { BrandMark } from '../../components/brand/brand-mark';

const highlights = [
  'Organização financeira em um só lugar',
  'Visão compartilhada entre as pessoas da casa',
  'Controle claro de receitas e despesas',
];

interface AuthShellProps extends PropsWithChildren {
  subtitle?: ReactNode;
}

export function AuthShell({ subtitle, children }: AuthShellProps) {
  return (
    <div data-theme="dark" className="min-h-svh bg-page">
      <div className="grid min-h-svh lg:grid-cols-2">
        <aside
          aria-hidden="true"
          className="hidden flex-col justify-between bg-page-deep px-12 py-14 lg:flex"
        >
          <BrandMark size="lg" />

          <div className="max-w-sm">
            <p className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink">
              Suas finanças da casa, organizadas em um só lugar.
            </p>
            <ul className="mt-10 flex flex-col gap-4">
              {highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-3 text-ink-muted">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-ink-muted">HSS Finance</p>
        </aside>

        <main className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md rounded-2xl border border-line/15 bg-surface p-8 shadow-xl shadow-black/20 sm:p-10">
            <div className="lg:hidden">
              <BrandMark size="sm" />
            </div>
            <p className="mt-4 text-sm text-ink-muted lg:mt-0">{subtitle}</p>

            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
