import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionsPage } from './transactions-page';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const TRANSACTION_ID = '11111111-1111-4111-8111-111111111111';

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

function categoriesResponse(categories: Array<Record<string, unknown>> = []): Response {
  return jsonResponse({ data: categories });
}

function category(overrides: Record<string, unknown> = {}) {
  return {
    id: CATEGORY_ID,
    name: 'Mercado',
    type: 'expense',
    color: null,
    icon: null,
    isDefault: false,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

function transactionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSACTION_ID,
    type: 'expense',
    amount: '150.00',
    transactionDate: '2026-09-01',
    dueDate: '2026-09-20',
    categoryId: null,
    description: 'Conta de luz',
    status: 'pending',
    ...overrides,
  };
}

function transactionsResponse(
  transactions: Array<Record<string, unknown>>,
  metaOverrides: Partial<{ page: number; limit: number; total: number; totalPages: number }> = {},
): Response {
  return jsonResponse({
    data: transactions,
    meta: {
      page: 1,
      limit: 20,
      total: transactions.length,
      totalPages: transactions.length > 0 ? 1 : 0,
      ...metaOverrides,
    },
  });
}

function createdTransactionResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(
    {
      data: {
        id: '55555555-5555-4555-8555-555555555555',
        type: 'expense',
        amount: '150.00',
        transactionDate: '2026-09-13',
        dueDate: null,
        categoryId: null,
        description: null,
        status: 'pending',
        paidAt: null,
        source: 'manual',
        expenseNature: null,
        recurringTransactionId: null,
        recurringPeriod: null,
        createdBy: '22222222-2222-4222-8222-222222222222',
        createdAt: '2026-09-13T12:00:00.000Z',
        updatedAt: '2026-09-13T12:00:00.000Z',
        ...overrides,
      },
    },
    201,
  );
}

type FetchHandler = (url: string) => Response | Promise<Response>;

function mockFetchByUrl(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, handler: FetchHandler) {
  fetchMock.mockImplementation(async (input) => handler(String(input)));
}

function renderTransactionsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TransactionsPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the page title and subtitle', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderTransactionsPage();

    expect(screen.getByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    expect(
      screen.getByText('Veja e acompanhe receitas e despesas da sua casa.'),
    ).toBeInTheDocument();
  });

  it('does not request transactions or categories before a household id is known', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderTransactionsPage();

    await screen.findByText('Você ainda não faz parte de nenhuma família no HSS Finance.');

    const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requestedUrls).toEqual(['http://localhost:3000/api/households']);
  });

  it('shows an accessible loading state while households are being fetched', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderTransactionsPage();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando lançamentos');
  });

  it('fetches transactions for the active household with page 1 and no filters by default', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse();
      if (url.includes('/transactions')) return transactionsResponse([]);
      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();

    await screen.findByText('Você ainda não possui lançamentos.');

    const transactionCall = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.includes('/transactions'));

    expect(transactionCall).toBe(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/transactions?page=1&limit=20`,
    );

    const categoriesCall = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.includes('/categories'));
    expect(categoriesCall).toBe(`http://localhost:3000/api/households/${HOUSEHOLD_ID}/categories`);
  });

  it('shows an empty state without filters when there are no transactions', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse();
      if (url.includes('/transactions')) return transactionsResponse([]);
      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();

    expect(await screen.findByText('Você ainda não possui lançamentos.')).toBeInTheDocument();
  });

  it('shows a filtered empty state when filters are active and there are no results', async () => {
    const user = userEvent.setup();
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse();
      if (url.includes('/transactions')) return transactionsResponse([]);
      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();
    await screen.findByText('Você ainda não possui lançamentos.');

    await user.selectOptions(screen.getByLabelText('Tipo'), 'income');

    expect(
      await screen.findByText('Nenhum lançamento encontrado para os filtros selecionados.'),
    ).toBeInTheDocument();
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
      if (url.includes('/categories')) return categoriesResponse();
      if (url.includes('/transactions')) return transactionsResponse([]);
      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar suas famílias agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Você ainda não possui lançamentos.')).toBeInTheDocument();
  });

  it('shows a temporary error with retry when the transactions request fails', async () => {
    const user = userEvent.setup();
    let transactionAttempts = 0;

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse();

      if (url.includes('/transactions')) {
        transactionAttempts += 1;

        if (transactionAttempts === 1) {
          throw new TypeError('Failed to fetch');
        }

        return transactionsResponse([]);
      }

      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os lançamentos agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Você ainda não possui lançamentos.')).toBeInTheDocument();
  });

  it('shows a safe 403 message without leaking the household id', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse();
      if (url.includes('/transactions')) {
        return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
      }
      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os lançamentos desta família.');
    expect(alert).not.toHaveTextContent(HOUSEHOLD_ID);
  });

  it('renders formatted BRL amounts, pt-BR dates, type and status labels, and category mapping', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-16T12:00:00.000Z'));

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse([category()]);
      if (url.includes('/transactions')) {
        return transactionsResponse([
          transactionRecord({
            id: '11111111-1111-4111-8111-111111111111',
            type: 'expense',
            amount: '1500.50',
            transactionDate: '2026-09-01',
            dueDate: '2026-09-20',
            status: 'pending',
            categoryId: CATEGORY_ID,
            description: 'Aluguel',
          }),
          transactionRecord({
            id: '22222222-2222-4222-8222-222222222222',
            type: 'income',
            amount: '3000.00',
            transactionDate: '2026-09-02',
            dueDate: null,
            status: 'paid',
            categoryId: null,
            description: 'Salário',
          }),
        ]);
      }
      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();

    const table = await screen.findByRole('table');
    const withinTable = within(table);

    expect(withinTable.getByText('Aluguel')).toBeInTheDocument();
    expect(withinTable.getByText(/R\$\s1\.500,50/)).toBeInTheDocument();
    expect(withinTable.getByText('Despesa')).toBeInTheDocument();
    expect(withinTable.getByText('01/09/2026')).toBeInTheDocument();
    expect(withinTable.getByText('20/09/2026')).toBeInTheDocument();
    expect(withinTable.getByText('Mercado')).toBeInTheDocument();
    expect(withinTable.getByText('Pendente')).toBeInTheDocument();

    expect(withinTable.getByText('Salário')).toBeInTheDocument();
    expect(withinTable.getByText(/R\$\s3\.000,00/)).toBeInTheDocument();
    expect(withinTable.getByText('Receita')).toBeInTheDocument();
    expect(withinTable.getByText('Pago')).toBeInTheDocument();
    expect(withinTable.getByText('Sem categoria')).toBeInTheDocument();
  });

  it('labels a pending transaction past its due date as overdue', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-16T12:00:00.000Z'));

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse();
      if (url.includes('/transactions')) {
        return transactionsResponse([
          transactionRecord({ status: 'pending', dueDate: '2026-09-10' }),
        ]);
      }
      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Vencida')).toBeInTheDocument();
  });

  it('renders both a desktop table and mobile card list for the same rows', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse();
      if (url.includes('/transactions')) return transactionsResponse([transactionRecord()]);
      return jsonResponse({ data: [] });
    });

    renderTransactionsPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Descrição' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();

    const cardList = screen.getByRole('list', { name: 'Lançamentos' });
    expect(within(cardList).getAllByRole('listitem')).toHaveLength(1);
  });

  describe('pagination', () => {
    it('shows real pagination from the backend and navigates to the next and previous pages', async () => {
      const user = userEvent.setup();

      mockFetchByUrl(fetchMock, (url) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories')) return categoriesResponse();

        if (url.includes('/transactions')) {
          const page = new URL(url).searchParams.get('page');
          return transactionsResponse([transactionRecord({ description: `Página ${page}` })], {
            page: Number(page),
            limit: 20,
            total: 3,
            totalPages: 2,
          });
        }

        return jsonResponse({ data: [] });
      });

      renderTransactionsPage();

      await screen.findByText('Página 1 de 2');
      expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Próxima página' })).toBeEnabled();

      await user.click(screen.getByRole('button', { name: 'Próxima página' }));

      await screen.findByText('Página 2 de 2');
      expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Página anterior' })).toBeEnabled();

      const pageTwoCall = fetchMock.mock.calls
        .map((call) => String(call[0]))
        .find((url) => url.includes('/transactions') && url.includes('page=2'));
      expect(pageTwoCall).toBeDefined();

      await user.click(screen.getByRole('button', { name: 'Página anterior' }));

      await screen.findByText('Página 1 de 2');
    });
  });

  describe('filters', () => {
    function mockFilterableFetch() {
      mockFetchByUrl(fetchMock, (url) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories')) return categoriesResponse([category()]);

        if (url.includes('/transactions')) {
          return transactionsResponse([transactionRecord()], {
            page: Number(new URL(url).searchParams.get('page')),
            total: 3,
            totalPages: 2,
          });
        }

        return jsonResponse({ data: [] });
      });
    }

    function latestTransactionsUrl(): URL {
      const urls = fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter((url) => url.includes('/transactions'));
      return new URL(urls[urls.length - 1]!);
    }

    it('applies the type filter as a query param', async () => {
      const user = userEvent.setup();
      mockFilterableFetch();

      renderTransactionsPage();
      await screen.findByText('Página 1 de 2');

      await user.selectOptions(screen.getByLabelText('Tipo'), 'income');

      await waitFor(() => expect(latestTransactionsUrl().searchParams.get('type')).toBe('income'));
    });

    it('applies the status filter as a query param', async () => {
      const user = userEvent.setup();
      mockFilterableFetch();

      renderTransactionsPage();
      await screen.findByText('Página 1 de 2');

      await user.selectOptions(screen.getByLabelText('Status'), 'paid');

      await waitFor(() => expect(latestTransactionsUrl().searchParams.get('status')).toBe('paid'));
    });

    it('applies the category filter as a query param', async () => {
      const user = userEvent.setup();
      mockFilterableFetch();

      renderTransactionsPage();
      await screen.findByText('Página 1 de 2');

      await user.selectOptions(screen.getByLabelText('Categoria'), CATEGORY_ID);

      await waitFor(() =>
        expect(latestTransactionsUrl().searchParams.get('categoryId')).toBe(CATEGORY_ID),
      );
    });

    it('applies the date range filters as query params', async () => {
      mockFilterableFetch();

      renderTransactionsPage();
      await screen.findByText('Página 1 de 2');

      fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-01' } });
      fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-30' } });

      await waitFor(() =>
        expect(latestTransactionsUrl().searchParams.get('startDate')).toBe('2026-09-01'),
      );
      expect(latestTransactionsUrl().searchParams.get('endDate')).toBe('2026-09-30');
    });

    it('resets to page 1 when a filter changes after navigating to another page', async () => {
      const user = userEvent.setup();
      mockFilterableFetch();

      renderTransactionsPage();
      await screen.findByText('Página 1 de 2');

      await user.click(screen.getByRole('button', { name: 'Próxima página' }));
      await screen.findByText('Página 2 de 2');

      await user.selectOptions(screen.getByLabelText('Tipo'), 'expense');

      await waitFor(() => expect(latestTransactionsUrl().searchParams.get('page')).toBe('1'));
      expect(latestTransactionsUrl().searchParams.get('type')).toBe('expense');
    });
  });

  describe('novo lançamento', () => {
    function mockFetchForCreateFlow() {
      let transactionsGetCallCount = 0;

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories')) return categoriesResponse([category()]);

        if (url.includes('/transactions') && method === 'POST') {
          return createdTransactionResponse();
        }

        if (url.includes('/transactions')) {
          transactionsGetCallCount += 1;
          return transactionsResponse(
            transactionsGetCallCount === 1
              ? []
              : [transactionRecord({ description: 'Novo Mercado' })],
          );
        }

        return jsonResponse({ data: [] });
      });
    }

    async function fillMinimumValidFields(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText('Valor'), '150');
      fireEvent.change(screen.getByLabelText('Data do lançamento'), {
        target: { value: '2026-09-13' },
      });
    }

    it('does not show the button when there is no active household', async () => {
      mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

      renderTransactionsPage();

      await screen.findByText('Você ainda não faz parte de nenhuma família no HSS Finance.');
      expect(screen.queryByRole('button', { name: 'Novo lançamento' })).not.toBeInTheDocument();
    });

    it('opens the form when the button is clicked', async () => {
      const user = userEvent.setup();
      mockFetchForCreateFlow();

      renderTransactionsPage();
      await user.click(await screen.findByRole('button', { name: 'Novo lançamento' }));

      expect(screen.getByRole('heading', { name: 'Novo lançamento' })).toBeInTheDocument();
      expect(screen.getByLabelText('Valor')).toBeInTheDocument();
    });

    it('closes the form and creates nothing when cancel is clicked', async () => {
      const user = userEvent.setup();
      mockFetchForCreateFlow();

      renderTransactionsPage();
      await user.click(await screen.findByRole('button', { name: 'Novo lançamento' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByLabelText('Valor')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Novo lançamento' })).toBeInTheDocument();

      const postCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
      expect(postCalls).toHaveLength(0);
    });

    it('creates a transaction, shows success, closes the form, and refreshes the list', async () => {
      const user = userEvent.setup();
      mockFetchForCreateFlow();

      renderTransactionsPage();
      await screen.findByText('Você ainda não possui lançamentos.');

      await user.click(screen.getByRole('button', { name: 'Novo lançamento' }));
      await fillMinimumValidFields(user);
      await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

      const successMessage = await screen.findByText('Lançamento criado com sucesso.');
      expect(successMessage).toHaveAttribute('role', 'status');
      expect(screen.queryByLabelText('Valor')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Novo lançamento' })).toBeInTheDocument();

      expect((await screen.findAllByText('Novo Mercado')).length).toBeGreaterThan(0);
    });
  });
});
