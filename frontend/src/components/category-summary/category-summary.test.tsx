import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CategorySummary } from './category-summary';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const MERCADO_CATEGORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRANSPORTE_CATEGORY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

function renderCategorySummary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <CategorySummary />
    </QueryClientProvider>,
  );
}

describe('CategorySummary', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-15T15:00:00.000Z'));
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows an accessible loading state while households are being fetched', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderCategorySummary();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando gastos por categoria');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not request the category summary before a household id is known', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderCategorySummary();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3000/api/households');
  });

  it('renders nothing extra when the user has no household', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    const { container } = renderCategorySummary();

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    expect(container).toBeEmptyDOMElement();
  });

  it('requests the current civil month (America/Sao_Paulo) as startDate/endDate', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    await screen.findByText('Nenhuma despesa registrada neste mês.');

    const categoryCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/summary/categories'));

    expect(categoryCalls).toEqual([
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/summary/categories?startDate=2026-09-01&endDate=2026-09-30`,
    ]);
  });

  it('shows the period label for the current month', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    expect(await screen.findByText('setembro de 2026')).toBeInTheDocument();
  });

  it('shows an empty state, not an error or a fake chart, when there are no expenses this month', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    expect(await screen.findByText('Nenhuma despesa registrada neste mês.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders categories ordered by expense with real BRL values and percentages', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/categories')) {
        return jsonResponse({
          data: [
            { categoryId: MERCADO_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '2000.00' },
            {
              categoryId: TRANSPORTE_CATEGORY_ID,
              categoryName: 'Transporte',
              totalExpense: '1000.00',
            },
          ],
        });
      }

      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    expect(within(items[0]!).getByText('Mercado')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/R\$\s2\.000,00/)).toBeInTheDocument();
    expect(within(items[0]!).getByText('(66.67%)')).toBeInTheDocument();

    expect(within(items[1]!).getByText('Transporte')).toBeInTheDocument();
    expect(within(items[1]!).getByText(/R\$\s1\.000,00/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('(33.33%)')).toBeInTheDocument();
  });

  it('gives the highest-expense category a proportionally wider bar than a smaller one', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/categories')) {
        return jsonResponse({
          data: [
            { categoryId: MERCADO_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '2000.00' },
            {
              categoryId: TRANSPORTE_CATEGORY_ID,
              categoryName: 'Transporte',
              totalExpense: '1000.00',
            },
          ],
        });
      }

      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    const firstBar = items[0]!.querySelector('[aria-hidden="true"] > div') as HTMLElement;
    const secondBar = items[1]!.querySelector('[aria-hidden="true"] > div') as HTMLElement;

    expect(firstBar.style.width).toBe('66.67%');
    expect(secondBar.style.width).toBe('33.33%');
  });

  it('groups categories beyond the top 5 into a single "Outros" row', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/categories')) {
        return jsonResponse({
          data: Array.from({ length: 7 }, (_, index) => ({
            categoryId: `cccccccc-cccc-4ccc-8ccc-cccccccccc${String(index).padStart(2, '0')}`,
            categoryName: `Categoria ${index}`,
            totalExpense: '10.00',
          })),
        });
      }

      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(within(items[5]!).getByText('Outros')).toBeInTheDocument();
  });

  it('never renders technical ids in the list', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/categories')) {
        return jsonResponse({
          data: [
            { categoryId: MERCADO_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '10.00' },
          ],
        });
      }

      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    await screen.findByRole('list');

    expect(screen.queryByText(MERCADO_CATEGORY_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(HOUSEHOLD_ID)).not.toBeInTheDocument();
  });

  it('shows a temporary error with retry when the households request fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let householdsAttempts = 0;

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) {
        householdsAttempts += 1;

        if (householdsAttempts === 1) {
          throw new TypeError('Failed to fetch');
        }

        return householdsResponse();
      }

      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar suas famílias agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Nenhuma despesa registrada neste mês.')).toBeInTheDocument();
  });

  it('shows a temporary error with retry when the category summary request fails, without logging the user out', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let categoryAttempts = 0;

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/categories')) {
        categoryAttempts += 1;

        if (categoryAttempts === 1) {
          throw new TypeError('Failed to fetch');
        }

        return jsonResponse({ data: [] });
      }

      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os gastos por categoria agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Nenhuma despesa registrada neste mês.')).toBeInTheDocument();
  });

  it('shows a safe 403 message without leaking the household id', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/summary/categories')) {
        return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
      }

      return jsonResponse({ data: [] });
    });

    renderCategorySummary();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os dados desta família.');
    expect(alert).not.toHaveTextContent(HOUSEHOLD_ID);
  });

  it('never renders fabricated placeholder data while loading or on error', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    });

    renderCategorySummary();

    await screen.findByRole('alert');

    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
