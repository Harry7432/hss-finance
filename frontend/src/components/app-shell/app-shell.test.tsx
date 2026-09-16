import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '../../auth/auth-context';
import { AppShell } from './app-shell';

const authenticatedUser = {
  id: '4f8b5484-e733-45f9-9744-a756b1baa1ef',
  name: 'Harry Sousa',
  email: 'harry@example.com',
  createdAt: '2026-09-13T15:00:00.000Z',
};

function renderAppShell(overrides: Partial<AuthContextValue> = {}) {
  const logout = vi.fn().mockResolvedValue(undefined);
  const value: AuthContextValue = {
    status: 'authenticated',
    user: authenticatedUser,
    login: vi.fn(),
    logout,
    retry: vi.fn(),
    ...overrides,
  };

  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [{ path: 'app', element: <p>Conteúdo do dashboard</p> }],
      },
    ],
    { initialEntries: ['/app'] },
  );

  render(
    <AuthContext value={value}>
      <RouterProvider router={router} />
    </AuthContext>,
  );

  return { logout };
}

describe('AppShell', () => {
  it('renders semantic landmarks and the authenticated user name', () => {
    renderAppShell();

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('Harry Sousa')).toBeInTheDocument();
  });

  it('marks the Dashboard nav item as the active page', () => {
    renderAppShell();

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders a working link to the family route', () => {
    renderAppShell();

    expect(screen.getByRole('link', { name: 'Família' })).toHaveAttribute('href', '/app/family');
  });

  it('renders a working link to the transactions route', () => {
    renderAppShell();

    expect(screen.getByRole('link', { name: 'Lançamentos' })).toHaveAttribute(
      'href',
      '/app/transactions',
    );
  });

  it('renders a working link to the categories route', () => {
    renderAppShell();

    expect(screen.getByRole('link', { name: 'Categorias' })).toHaveAttribute(
      'href',
      '/app/categories',
    );
  });

  it('logs out from the sidebar, shows loading feedback, and blocks a second click', async () => {
    const user = userEvent.setup();
    let resolveLogout: () => void = () => undefined;
    const logout = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    renderAppShell({ logout });

    const logoutButtons = screen.getAllByRole('button', { name: 'Sair' });
    await user.click(logoutButtons[0]);

    expect(screen.getByRole('button', { name: 'Saindo...' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saindo...' }));
    expect(logout).toHaveBeenCalledTimes(1);

    resolveLogout();
    await screen.findByRole('button', { name: 'Sair' });
  });

  it('opens the mobile drawer, closes it on Escape, and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    renderAppShell();

    const menuButton = screen.getByRole('button', { name: 'Menu' });
    await user.click(menuButton);

    const dialog = await screen.findByRole('dialog', { name: 'Menu de navegação' });
    expect(dialog).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
    expect(menuButton).toHaveFocus();
  });

  it('closes the mobile drawer when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    renderAppShell();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await screen.findByRole('dialog', { name: 'Menu de navegação' });

    await user.click(screen.getByTestId('mobile-nav-backdrop'));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes the mobile drawer via its own close button and includes a working logout action', async () => {
    const user = userEvent.setup();
    renderAppShell();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await screen.findByRole('dialog', { name: 'Menu de navegação' });

    expect(screen.getAllByRole('button', { name: 'Sair' })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the user menu closed by default and reveals a logout action when opened', async () => {
    const user = userEvent.setup();
    renderAppShell();

    expect(screen.queryByRole('menu', { name: 'Menu do usuário' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sair' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Harry Sousa/ }));

    const menu = await screen.findByRole('menu', { name: 'Menu do usuário' });
    expect(menu).toHaveTextContent('harry@example.com');
    expect(screen.getAllByRole('button', { name: 'Sair' })).toHaveLength(2);
  });

  it('closes the user menu on Escape', async () => {
    const user = userEvent.setup();
    renderAppShell();

    await user.click(screen.getByRole('button', { name: /Harry Sousa/ }));
    await screen.findByRole('menu', { name: 'Menu do usuário' });

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: 'Menu do usuário' })).not.toBeInTheDocument();
  });

  it('closes the user menu when clicking outside of it', async () => {
    const user = userEvent.setup();
    renderAppShell();

    await user.click(screen.getByRole('button', { name: /Harry Sousa/ }));
    await screen.findByRole('menu', { name: 'Menu do usuário' });

    await user.click(screen.getByRole('main'));

    expect(screen.queryByRole('menu', { name: 'Menu do usuário' })).not.toBeInTheDocument();
  });

  it('renders no user menu when no authenticated user is available', () => {
    renderAppShell({ user: null });

    expect(screen.queryByRole('button', { name: /Harry Sousa/ })).not.toBeInTheDocument();
  });

  it('traps Tab focus within the mobile drawer, wrapping from edge to edge', async () => {
    const user = userEvent.setup();
    renderAppShell();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu de navegação' });
    const withinDialog = within(dialog);

    const closeButton = withinDialog.getByRole('button', { name: 'Fechar' });
    const logoutButton = withinDialog.getByRole('button', { name: 'Sair' });
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(logoutButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });
});
