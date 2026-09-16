import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '../../auth/auth-context';
import { DashboardPage } from './dashboard-page';

function renderDashboard(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    status: 'authenticated',
    user: {
      id: '4f8b5484-e733-45f9-9744-a756b1baa1ef',
      name: 'Harry Sousa',
      email: 'harry@example.com',
      createdAt: '2026-09-13T15:00:00.000Z',
    },
    login: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };

  render(
    <AuthContext value={value}>
      <DashboardPage />
    </AuthContext>,
  );
}

describe('DashboardPage', () => {
  it('renders the overview heading and a greeting with the user first name', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByText(/Olá, Harry\./)).toBeInTheDocument();
  });

  it('shows a neutral structural placeholder instead of fake financial data', () => {
    renderDashboard();

    expect(screen.getByText('Resumo financeiro será exibido aqui.')).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s?\d/)).not.toBeInTheDocument();
  });
});
