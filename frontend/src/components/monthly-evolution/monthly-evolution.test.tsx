import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MonthlyEvolution } from './monthly-evolution';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';

const SIX_ZEROED_MONTHS = [
  { month: '2026-04', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
  { month: '2026-05', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
  { month: '2026-06', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
  { month: '2026-07', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
  { month: '2026-08', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
  { month: '2026-09', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function householdsResponse(): Response {
  return jsonResponse({
    data: [
      {
        id: HOUSEHOLD_ID,
        name: 'Casa Sousa',
        currencyCode: 'BRL',
        role: 'owner',
        createdAt: '2026-09-01T12:00:00.000Z',
      },
    ],
  });
}

function noHouseholdsResponse(): Response {
  return jsonResponse({ data: [] });
}

type FetchHandler = (url: string) => Response | Promise<Response>;

function mockFetchByUrl(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, handler: FetchHandler) {
  fetchMock.mockImplementation(async (input) => handler(String(input)));
}

function renderMonthlyEvolution() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MonthlyEvolution />
    </QueryClientProvider>,
  );
}

describe('MonthlyEvolution', () => {
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

    renderMonthlyEvolution();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando evolução mensal');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not request the monthly summary before a household id is known', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderMonthlyEvolution();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3000/api/households');
  });

  it('renders nothing extra when the user has no household', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    const { container } = renderMonthlyEvolution();

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    expect(container).toBeEmptyDOMElement();
  });

  it('requests the summary/monthly endpoint for the active household, with no date query params', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ data: SIX_ZEROED_MONTHS });
    });

    renderMonthlyEvolution();

    await screen.findByText('Nenhuma movimentação registrada nos últimos 6 meses.');

    const monthlyCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/summary/monthly'));

    expect(monthlyCalls).toEqual([
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/summary/monthly`,
    ]);
  });

  it('shows a zeroed structure, not a fake chart, when there is no movement in any of the six months', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ data: SIX_ZEROED_MONTHS });
    });

    renderMonthlyEvolution();

    expect(
      await screen.findByText('Nenhuma movimentação registrada nos últimos 6 meses.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
  });

  it('renders all six months in chronological order with real BRL values', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/monthly')) {
        return jsonResponse({
          data: [
            ...SIX_ZEROED_MONTHS.slice(0, 5),
            { month: '2026-09', totalIncome: '1000.00', totalExpense: '700.00', balance: '300.00' },
          ],
        });
      }

      return jsonResponse({ data: [] });
    });

    renderMonthlyEvolution();

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(6);

    expect(within(items[0]!).getByText('abr/26')).toBeInTheDocument();
    expect(within(items[5]!).getByText('set/26')).toBeInTheDocument();
    expect(within(items[5]!).getByText(/R\$\s1\.000,00/)).toBeInTheDocument();
    expect(within(items[5]!).getByText(/R\$\s700,00/)).toBeInTheDocument();
    expect(within(items[5]!).getByText(/R\$\s300,00/)).toBeInTheDocument();
  });

  it('shows a negative balance with its sign, not color alone', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/monthly')) {
        return jsonResponse({
          data: [
            ...SIX_ZEROED_MONTHS.slice(0, 5),
            { month: '2026-09', totalIncome: '500.00', totalExpense: '700.00', balance: '-200.00' },
          ],
        });
      }

      return jsonResponse({ data: [] });
    });

    renderMonthlyEvolution();

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(within(items[5]!).getByText(/-R\$\s200,00/)).toBeInTheDocument();
  });

  it('never renders technical ids in the chart', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ data: SIX_ZEROED_MONTHS });
    });

    renderMonthlyEvolution();

    await screen.findByRole('list');

    expect(screen.queryByText(HOUSEHOLD_ID)).not.toBeInTheDocument();
  });

  it('shows a temporary error with retry when the households request fails', async () => {
    const user = userEvent.setup();
    let householdsAttempts = 0;

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) {
        householdsAttempts += 1;

        if (householdsAttempts === 1) {
          throw new TypeError('Failed to fetch');
        }

        return householdsResponse();
      }

      return jsonResponse({ data: SIX_ZEROED_MONTHS });
    });

    renderMonthlyEvolution();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar suas famílias agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(
      await screen.findByText('Nenhuma movimentação registrada nos últimos 6 meses.'),
    ).toBeInTheDocument();
  });

  it('shows a temporary error with retry when the monthly summary request fails, without logging the user out', async () => {
    const user = userEvent.setup();
    let monthlyAttempts = 0;

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/monthly')) {
        monthlyAttempts += 1;

        if (monthlyAttempts === 1) {
          throw new TypeError('Failed to fetch');
        }

        return jsonResponse({ data: SIX_ZEROED_MONTHS });
      }

      return jsonResponse({ data: [] });
    });

    renderMonthlyEvolution();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar a evolução mensal agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(
      await screen.findByText('Nenhuma movimentação registrada nos últimos 6 meses.'),
    ).toBeInTheDocument();
  });

  it('shows a safe 403 message without leaking the household id', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/monthly')) {
        return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
      }

      return jsonResponse({ data: [] });
    });

    renderMonthlyEvolution();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os dados desta família.');
    expect(alert).not.toHaveTextContent(HOUSEHOLD_ID);
  });

  it('never renders fabricated placeholder data while loading or on error', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    });

    renderMonthlyEvolution();

    await screen.findByRole('alert');

    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
