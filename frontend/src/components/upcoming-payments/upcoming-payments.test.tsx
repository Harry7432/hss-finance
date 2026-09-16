import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpcomingPayments } from './upcoming-payments';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const OVERDUE_TRANSACTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TODAY_TRANSACTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FUTURE_TRANSACTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

function transactionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'expense',
    amount: '150.00',
    transactionDate: '2026-09-01',
    dueDate: '2026-09-20',
    categoryId: null,
    description: 'Conta de luz',
    status: 'pending',
    paidAt: null,
    source: 'manual',
    expenseNature: 'variable',
    recurringTransactionId: null,
    recurringPeriod: null,
    createdBy: '22222222-2222-4222-8222-222222222222',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

type FetchHandler = (url: string) => Response | Promise<Response>;

function mockFetchByUrl(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, handler: FetchHandler) {
  fetchMock.mockImplementation(async (input) => handler(String(input)));
}

function renderUpcomingPayments() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <UpcomingPayments />
    </QueryClientProvider>,
  );
}

describe('UpcomingPayments', () => {
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

    renderUpcomingPayments();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando próximos vencimentos');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not request transactions before a household id is known', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderUpcomingPayments();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3000/api/households');
  });

  it('renders nothing extra when the user has no household (financial summary already explains it)', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    const { container } = renderUpcomingPayments();

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    expect(container).toBeEmptyDOMElement();
  });

  it('requests overdue and pending transactions sorted by dueDate ascending, capped at 5 each', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) {
        return householdsResponse();
      }

      return jsonResponse({ data: [] });
    });

    renderUpcomingPayments();

    await screen.findByText('Nenhuma conta próxima do vencimento.');

    const transactionCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/transactions'));

    expect(transactionCalls).toHaveLength(2);
    expect(new Set(transactionCalls)).toEqual(
      new Set([
        `http://localhost:3000/api/households/${HOUSEHOLD_ID}/transactions?state=overdue&sortBy=dueDate&sortOrder=asc&limit=5&page=1`,
        `http://localhost:3000/api/households/${HOUSEHOLD_ID}/transactions?state=pending&sortBy=dueDate&sortOrder=asc&limit=5&page=1`,
      ]),
    );
  });

  it('shows an empty state, not an error, when there are no upcoming payments', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ data: [] });
    });

    renderUpcomingPayments();

    expect(await screen.findByText('Nenhuma conta próxima do vencimento.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders overdue, due-today, and future transactions with a textual state, real BRL values, and pt-BR dates', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('state=overdue')) {
        return jsonResponse({
          data: [
            transactionRecord({
              id: OVERDUE_TRANSACTION_ID,
              description: 'Cartão de crédito',
              amount: '320.50',
              dueDate: '2026-09-10',
            }),
          ],
        });
      }

      if (url.includes('state=pending')) {
        return jsonResponse({
          data: [
            transactionRecord({
              id: TODAY_TRANSACTION_ID,
              description: 'Internet',
              amount: '99.90',
              dueDate: '2026-09-15',
            }),
            transactionRecord({
              id: FUTURE_TRANSACTION_ID,
              type: 'income',
              description: null,
              amount: '1500.00',
              dueDate: '2026-09-25',
            }),
          ],
        });
      }

      return jsonResponse({ data: [] });
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-15T15:00:00.000Z'));

    renderUpcomingPayments();

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);

    expect(within(items[0]!).getByText('Cartão de crédito')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Vencida/)).toBeInTheDocument();
    expect(within(items[0]!).getByText(/10\/09\/2026/)).toBeInTheDocument();
    expect(within(items[0]!).getByText(/R\$\s320,50/)).toBeInTheDocument();

    expect(within(items[1]!).getByText('Internet')).toBeInTheDocument();
    expect(within(items[1]!).getByText(/Vence hoje/)).toBeInTheDocument();
    expect(within(items[1]!).getByText(/15\/09\/2026/)).toBeInTheDocument();

    expect(within(items[2]!).getByText('Sem descrição')).toBeInTheDocument();
    expect(within(items[2]!).getByText(/25\/09\/2026/)).toBeInTheDocument();
    expect(within(items[2]!).getByText(/R\$\s1\.500,00/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('caps the combined list at 5 items even when overdue and pending each return their own 5', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('state=overdue')) {
        return jsonResponse({
          data: Array.from({ length: 5 }, (_, index) =>
            transactionRecord({
              id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
              dueDate: `2026-09-0${index + 1}`,
            }),
          ),
        });
      }

      if (url.includes('state=pending')) {
        return jsonResponse({
          data: Array.from({ length: 5 }, (_, index) =>
            transactionRecord({
              id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`,
              dueDate: `2026-09-2${index}`,
            }),
          ),
        });
      }

      return jsonResponse({ data: [] });
    });

    renderUpcomingPayments();

    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });

  it('never shows a pending transaction without a due date as an upcoming payment', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('state=pending')) {
        return jsonResponse({
          data: [
            transactionRecord({ id: TODAY_TRANSACTION_ID, dueDate: '2026-09-16' }),
            // Represents a NULLS LAST row the backend may still include within the
            // capped page when fewer than 5 pending transactions have a due date.
            transactionRecord({ id: FUTURE_TRANSACTION_ID, dueDate: null }),
          ],
        });
      }

      return jsonResponse({ data: [] });
    });

    renderUpcomingPayments();

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(within(list).queryByText(FUTURE_TRANSACTION_ID)).not.toBeInTheDocument();
  });

  it('never renders technical ids in the list', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('state=overdue')) {
        return jsonResponse({ data: [transactionRecord({ id: OVERDUE_TRANSACTION_ID })] });
      }

      return jsonResponse({ data: [] });
    });

    renderUpcomingPayments();

    await screen.findByRole('list');

    expect(screen.queryByText(OVERDUE_TRANSACTION_ID)).not.toBeInTheDocument();
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

      return jsonResponse({ data: [] });
    });

    renderUpcomingPayments();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar suas famílias agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Nenhuma conta próxima do vencimento.')).toBeInTheDocument();
  });

  it('shows a temporary error with retry when the transactions request fails, without logging the user out', async () => {
    const user = userEvent.setup();
    let transactionAttempts = 0;

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/transactions')) {
        transactionAttempts += 1;

        if (transactionAttempts <= 2) {
          throw new TypeError('Failed to fetch');
        }

        return jsonResponse({ data: [] });
      }

      return jsonResponse({ data: [] });
    });

    renderUpcomingPayments();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os próximos vencimentos agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Nenhuma conta próxima do vencimento.')).toBeInTheDocument();
  });

  it('shows a safe 403 message without leaking the household id', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/transactions')) {
        return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
      }

      return jsonResponse({ data: [] });
    });

    renderUpcomingPayments();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar as contas desta família.');
    expect(alert).not.toHaveTextContent(HOUSEHOLD_ID);
  });

  it('never renders fabricated placeholder data while loading or on error', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    });

    renderUpcomingPayments();

    await screen.findByRole('alert');

    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
