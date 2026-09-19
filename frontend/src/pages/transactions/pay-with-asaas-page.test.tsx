import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PayWithAsaasPage } from './pay-with-asaas-page';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const TRANSACTION_ID = '11111111-1111-4111-8111-111111111111';
const IDENTIFICATION_FIELD = '03399.77779 29900.000000 04751.101017 1 81510000002990';

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

function transactionResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse({
    data: {
      id: TRANSACTION_ID,
      type: 'expense',
      amount: '200.00',
      transactionDate: '2026-09-01',
      dueDate: '2026-09-23',
      categoryId: null,
      description: 'Conta de luz',
      status: 'pending',
      ...overrides,
    },
  });
}

function noPaymentAttemptResponse(): Response {
  return jsonResponse({ data: null });
}

function paymentAttemptResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse({
    data: {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'processing',
      kind: 'bill',
      createdAt: '2026-09-18T12:00:00.000Z',
      updatedAt: '2026-09-18T12:00:00.000Z',
      confirmedAt: null,
      ...overrides,
    },
  });
}

function simulationResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse({
    data: {
      transaction: { id: TRANSACTION_ID, amount: '200.00', status: 'pending' },
      simulation: {
        value: 200,
        dueDate: '2026-09-23',
        originalValue: 200,
        isOverdue: false,
        allowChangeValue: false,
        minValue: null,
        maxValue: null,
        beneficiaryName: 'Companhia de Energia',
        companyName: null,
        fee: 1.5,
        minimumScheduleDate: null,
      },
      amountMatchesTransaction: true,
      ...overrides,
    },
  });
}

function payBillResponse(status = 'processing'): Response {
  return jsonResponse({
    data: {
      paymentAttempt: {
        id: '22222222-2222-4222-8222-222222222222',
        status,
        kind: 'bill',
      },
      provider: { status: 'PENDING' },
    },
  });
}

type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function mockFetch(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, handler: FetchHandler) {
  fetchMock.mockImplementation(async (input, init) => handler(String(input), init));
}

function renderPayPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: '/app/transactions/:transactionId/pay', element: <PayWithAsaasPage /> }],
    { initialEntries: [`/app/transactions/${TRANSACTION_ID}/pay`] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('PayWithAsaasPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function mockDefaultFlow({
    transactionOverrides = {},
    attemptResponse = noPaymentAttemptResponse,
  }: {
    transactionOverrides?: Record<string, unknown>;
    attemptResponse?: () => Response;
  } = {}) {
    mockFetch(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/payment/bill/attempt')) return attemptResponse();
      if (url.match(/\/transactions\/[^/]+$/)) return transactionResponse(transactionOverrides);
      return jsonResponse({ data: null });
    });
  }

  it('shows the transaction summary and the bill payment form when no attempt exists yet', async () => {
    mockDefaultFlow();

    renderPayPage();

    expect(
      await screen.findByRole('heading', { name: 'Conta de luz' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/R\$\s200,00/)).toBeInTheDocument();
    expect(screen.getByLabelText('Linha digitável')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pagamento' })).not.toBeInTheDocument();
  });

  it('does not allow confirming payment before a simulation succeeds', async () => {
    mockDefaultFlow();

    renderPayPage();

    await screen.findByLabelText('Linha digitável');
    expect(screen.queryByRole('button', { name: 'Confirmar pagamento' })).not.toBeInTheDocument();

    const postCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('shows a safe message and lets the user retry when the transaction cannot be found', async () => {
    const user = userEvent.setup();
    let transactionCallCount = 0;

    mockFetch(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/payment/bill/attempt')) return noPaymentAttemptResponse();
      if (url.match(/\/transactions\/[^/]+$/)) {
        transactionCallCount += 1;
        return transactionCallCount === 1
          ? jsonResponse({ error: { code: 'TRANSACTION_NOT_FOUND', message: 'not found' } }, 404)
          : transactionResponse();
      }
      return jsonResponse({ data: null });
    });

    renderPayPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Transação não encontrada.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('heading', { name: 'Conta de luz' })).toBeInTheDocument();
  });

  it('shows a distinct message when the user has no active household', async () => {
    mockFetch(fetchMock, (url) => {
      if (url.endsWith('/households')) return jsonResponse({ data: [] });
      return jsonResponse({ data: null });
    });

    renderPayPage();

    expect(
      await screen.findByText('Você ainda não faz parte de nenhuma família no HSS Finance.'),
    ).toBeInTheDocument();
  });

  it('simulates a valid bill and shows the confirmation card', async () => {
    const user = userEvent.setup();
    mockFetch(fetchMock, (url, init) => {
      const method = init?.method ?? 'GET';

      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/payment/bill/attempt')) return noPaymentAttemptResponse();
      if (url.includes('/payment/bill/simulate') && method === 'POST') {
        return simulationResponse();
      }
      if (url.match(/\/transactions\/[^/]+$/)) return transactionResponse();
      return jsonResponse({ data: null });
    });

    renderPayPage();

    await user.type(await screen.findByLabelText('Linha digitável'), IDENTIFICATION_FIELD);
    await user.click(screen.getByRole('button', { name: 'Simular pagamento' }));

    expect(await screen.findByRole('heading', { name: 'Confirmar pagamento' })).toBeInTheDocument();
    expect(screen.getByText('Companhia de Energia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar pagamento' })).toBeInTheDocument();
  });

  it('warns about a value mismatch and refuses to show a confirm button', async () => {
    const user = userEvent.setup();
    mockFetch(fetchMock, (url, init) => {
      const method = init?.method ?? 'GET';

      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/payment/bill/attempt')) return noPaymentAttemptResponse();
      if (url.includes('/payment/bill/simulate') && method === 'POST') {
        return simulationResponse({ amountMatchesTransaction: false });
      }
      if (url.match(/\/transactions\/[^/]+$/)) return transactionResponse();
      return jsonResponse({ data: null });
    });

    renderPayPage();

    await user.type(await screen.findByLabelText('Linha digitável'), IDENTIFICATION_FIELD);
    await user.click(screen.getByRole('button', { name: 'Simular pagamento' }));

    expect(
      await screen.findByText('O valor retornado pelo Asaas é diferente do valor da transação.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pagamento' })).not.toBeInTheDocument();

    const postCalls = fetchMock.mock.calls.filter(
      (call) =>
        call[1]?.method === 'POST' &&
        String(call[0]).includes('/payment/bill') &&
        !String(call[0]).includes('simulate'),
    );
    expect(postCalls).toHaveLength(0);
  });

  it('shows a safe, friendly message when the simulation is rejected', async () => {
    const user = userEvent.setup();
    mockFetch(fetchMock, (url, init) => {
      const method = init?.method ?? 'GET';

      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/payment/bill/attempt')) return noPaymentAttemptResponse();
      if (url.includes('/payment/bill/simulate') && method === 'POST') {
        return jsonResponse(
          { error: { code: 'INVALID_BILL', message: 'The bill could not be validated' } },
          422,
        );
      }
      if (url.match(/\/transactions\/[^/]+$/)) return transactionResponse();
      return jsonResponse({ data: null });
    });

    renderPayPage();

    await user.type(await screen.findByLabelText('Linha digitável'), IDENTIFICATION_FIELD);
    await user.click(screen.getByRole('button', { name: 'Simular pagamento' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O boleto informado não pôde ser validado pelo Asaas.');
    expect(alert).not.toHaveTextContent('INVALID_BILL');
    expect(alert).not.toHaveTextContent(IDENTIFICATION_FIELD);
  });

  // Explicit timeout above vitest's 5000ms default: this test performs two real user-event
  // interactions plus two bounded waitFor/findBy calls (3000ms each). Under the full suite with
  // coverage instrumentation and 40 parallel jsdom environments, their combined wall-clock time
  // can exceed the default per-test budget even though no single wait is slow on its own.
  it('disables the confirm button while the payment POST is in flight and submits it only once', async () => {
    const user = userEvent.setup();
    let resolvePay: (response: Response) => void = () => undefined;
    let payCallCount = 0;

    mockFetch(fetchMock, (url, init) => {
      const method = init?.method ?? 'GET';

      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/payment/bill/simulate') && method === 'POST') {
        return simulationResponse();
      }
      if (url.includes('/payment/bill') && url.includes('/attempt')) {
        return payCallCount > 0 ? paymentAttemptResponse() : noPaymentAttemptResponse();
      }
      if (url.includes('/payment/bill') && method === 'POST') {
        payCallCount += 1;
        return new Promise<Response>((resolve) => {
          resolvePay = resolve;
        });
      }
      if (url.match(/\/transactions\/[^/]+$/)) return transactionResponse();
      return jsonResponse({ data: null });
    });

    renderPayPage();

    await user.type(await screen.findByLabelText('Linha digitável'), IDENTIFICATION_FIELD);
    await user.click(screen.getByRole('button', { name: 'Simular pagamento' }));
    await screen.findByRole('button', { name: 'Confirmar pagamento' });

    const confirmButton = screen.getByRole('button', { name: 'Confirmar pagamento' });
    await user.click(confirmButton);

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Confirmando...' })).toBeDisabled(),
      { timeout: 3000 },
    );
    await user.click(screen.getByRole('button', { name: 'Confirmando...' }));

    resolvePay(payBillResponse('processing'));

    await screen.findByText('Processamento iniciado', undefined, { timeout: 3000 });
    expect(payCallCount).toBe(1);
  }, 10000);

  it('shows the friendly processing status after a successful payment', async () => {
    const user = userEvent.setup();
    let paid = false;

    mockFetch(fetchMock, (url, init) => {
      const method = init?.method ?? 'GET';

      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/payment/bill/simulate') && method === 'POST') return simulationResponse();
      if (url.includes('/payment/bill') && url.includes('/attempt')) {
        return paid ? paymentAttemptResponse({ status: 'processing' }) : noPaymentAttemptResponse();
      }
      if (url.includes('/payment/bill') && method === 'POST') {
        paid = true;
        return payBillResponse('processing');
      }
      if (url.match(/\/transactions\/[^/]+$/)) return transactionResponse();
      return jsonResponse({ data: null });
    });

    renderPayPage();

    await user.type(await screen.findByLabelText('Linha digitável'), IDENTIFICATION_FIELD);
    await user.click(screen.getByRole('button', { name: 'Simular pagamento' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar pagamento' }));

    expect(await screen.findByText('Processamento iniciado')).toBeInTheDocument();
  });

  it('shows the uncertain status without offering an automatic retry', async () => {
    mockDefaultFlow({ attemptResponse: () => paymentAttemptResponse({ status: 'uncertain' }) });

    renderPayPage();

    expect(
      await screen.findByText('Confirmação pendente — não tente novamente'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('offers a retry after a failed attempt, which reopens the form instead of resubmitting', async () => {
    const user = userEvent.setup();
    mockDefaultFlow({ attemptResponse: () => paymentAttemptResponse({ status: 'failed' }) });

    renderPayPage();

    await screen.findByText('Pagamento não concluído');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(screen.getByLabelText('Linha digitável')).toBeInTheDocument();
    const postCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('blocks the payment flow for a transaction that is not pending and has no attempt yet', async () => {
    mockDefaultFlow({ transactionOverrides: { status: 'paid' } });

    renderPayPage();

    expect(
      await screen.findByText(
        'Esta transação não está pendente — não é possível iniciar um pagamento.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Linha digitável')).not.toBeInTheDocument();
  });

  it('never persists the linha digitável or puts it in the URL', async () => {
    const user = userEvent.setup();
    mockDefaultFlow();

    renderPayPage();

    await user.type(await screen.findByLabelText('Linha digitável'), IDENTIFICATION_FIELD);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain(IDENTIFICATION_FIELD);
    expect(window.location.href).not.toContain(IDENTIFICATION_FIELD);

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain(IDENTIFICATION_FIELD);
    }
  });
});
