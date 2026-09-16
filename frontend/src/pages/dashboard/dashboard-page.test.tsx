import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext value={value}>
        <DashboardPage />
      </AuthContext>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('renders the overview heading and a greeting with the user first name', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByText(/Olá, Harry\./)).toBeInTheDocument();
  });

  it('never shows a currency figure before the financial summary has loaded', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderDashboard();

    const statuses = screen.getAllByRole('status');
    expect(statuses.map((status) => status.textContent)).toEqual([
      expect.stringContaining('Carregando resumo financeiro'),
      expect.stringContaining('Carregando próximos vencimentos'),
      expect.stringContaining('Carregando gastos por categoria'),
    ]);
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it('renders the real financial summary once households and totals resolve', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith('/households')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10',
                  name: 'Casa Sousa',
                  currencyCode: 'BRL',
                  role: 'owner',
                  createdAt: '2026-09-01T12:00:00.000Z',
                },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        );
      }

      if (url.includes('/summary/categories')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.includes('/summary')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { totalIncome: '1000.00', totalExpense: '400.00', balance: '600.00' },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        );
      }

      if (url.includes('/transactions')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });

    renderDashboard();

    expect(await screen.findByRole('heading', { level: 2, name: 'Saldo' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s600,00/)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Próximos vencimentos' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nenhuma conta próxima do vencimento.')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Gastos por categoria' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nenhuma despesa registrada neste mês.')).toBeInTheDocument();
  });
});
