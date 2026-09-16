import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinancialSummary } from './financial-summary';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const OTHER_HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

function household(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: HOUSEHOLD_ID,
    name: 'Casa Sousa',
    currencyCode: 'BRL',
    role: 'owner',
    createdAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function summaryResponse(totalIncome: string, totalExpense: string, balance: string): Response {
  return jsonResponse({ data: { totalIncome, totalExpense, balance } });
}

function renderFinancialSummary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <FinancialSummary />
    </QueryClientProvider>,
  );
}

describe('FinancialSummary', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows an accessible loading state while households are being fetched', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderFinancialSummary();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando resumo financeiro');
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it('shows a distinct message when the user has no household', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    renderFinancialSummary();

    expect(
      await screen.findByText('Você ainda não faz parte de nenhuma família no HSS Finance.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('automatically selects the only household and requests its summary', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [household()] }))
      .mockResolvedValueOnce(summaryResponse('1000.00', '400.00', '600.00'));

    renderFinancialSummary();

    await screen.findByRole('heading', { level: 2, name: 'Saldo' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const summaryUrl = fetchMock.mock.calls[1]?.[0];
    expect(String(summaryUrl)).toBe(`http://localhost:3000/api/households/${HOUSEHOLD_ID}/summary`);
  });

  it('selects the first household from the list when there are multiple', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [household({ id: HOUSEHOLD_ID }), household({ id: OTHER_HOUSEHOLD_ID })],
        }),
      )
      .mockResolvedValueOnce(summaryResponse('0.00', '0.00', '0.00'));

    renderFinancialSummary();

    await screen.findByRole('heading', { level: 2, name: 'Saldo' });

    const summaryUrl = fetchMock.mock.calls[1]?.[0];
    expect(String(summaryUrl)).toBe(`http://localhost:3000/api/households/${HOUSEHOLD_ID}/summary`);
  });

  it('never requests the summary before a household id is known', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    renderFinancialSummary();

    await screen.findByText('Você ainda não faz parte de nenhuma família no HSS Finance.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3000/api/households');
  });

  it('renders the balance, income, and expense cards with real formatted values', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [household()] }))
      .mockResolvedValueOnce(summaryResponse('1000.00', '400.00', '600.00'));

    renderFinancialSummary();

    expect(await screen.findByRole('heading', { level: 2, name: 'Saldo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Receitas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Despesas' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s600,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s1\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s400,00/)).toBeInTheDocument();
  });

  it('renders a negative balance with its minus sign, not only a color cue', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [household()] }))
      .mockResolvedValueOnce(summaryResponse('0.00', '500.00', '-500.00'));

    renderFinancialSummary();

    expect(await screen.findByText(/-R\$\s500,00/)).toBeInTheDocument();
  });

  it('shows zero values normally alongside a discreet no-movement message', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [household()] }))
      .mockResolvedValueOnce(summaryResponse('0.00', '0.00', '0.00'));

    renderFinancialSummary();

    await screen.findByRole('heading', { level: 2, name: 'Saldo' });

    expect(screen.getAllByText(/R\$\s0,00/)).toHaveLength(3);
    expect(screen.getByText('Nenhuma movimentação registrada ainda.')).toBeInTheDocument();
  });

  it('shows a temporary error with retry when the households request fails', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ data: [household()] }))
      .mockResolvedValueOnce(summaryResponse('1000.00', '400.00', '600.00'));

    renderFinancialSummary();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar suas famílias agora.',
    );

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Saldo' })).toBeInTheDocument();
  });

  it('shows a temporary error with retry when the summary request fails', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [household()] }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(summaryResponse('1000.00', '400.00', '600.00'));

    renderFinancialSummary();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o resumo financeiro agora.',
    );

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Saldo' })).toBeInTheDocument();
  });

  it('shows a distinct, safe message when access to the household summary is denied', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [household()] }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403),
      );

    renderFinancialSummary();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os dados desta família.');
    expect(alert).not.toHaveTextContent(HOUSEHOLD_ID);
  });

  it('never persists any data manually in the browser', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [household()] }))
      .mockResolvedValueOnce(summaryResponse('1000.00', '400.00', '600.00'));

    renderFinancialSummary();

    await screen.findByRole('heading', { level: 2, name: 'Saldo' });

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
