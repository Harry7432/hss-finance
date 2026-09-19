import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AsaasStatementCard } from './asaas-statement-card';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AsaasStatementCard householdId={HOUSEHOLD_ID} />
    </QueryClientProvider>,
  );
}

describe('AsaasStatementCard', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows an amicable empty state instead of treating it as an error', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { transactions: [], totalCount: 0, hasMore: false, offset: 0, limit: 20 },
      }),
    );

    renderCard();

    expect(
      await screen.findByText('Nenhuma movimentação encontrada na conta Asaas ainda.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists the sanitized transactions returned by the backend', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          transactions: [
            {
              id: 'ftr_1',
              value: -50.5,
              type: 'PAYMENT',
              date: '2026-09-18',
              balance: 1184.06,
              description: 'Pagamento de boleto',
            },
          ],
          totalCount: 1,
          hasMore: false,
          offset: 0,
          limit: 20,
        },
      }),
    );

    renderCard();

    expect(await screen.findByText('Pagamento de boleto')).toBeInTheDocument();
    expect(screen.getByText(/-R\$\s50,50/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s1\.184,06/)).toBeInTheDocument();
  });

  it('shows a temporary error message when the request fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderCard();

    expect(
      await screen.findByText('Não foi possível carregar o extrato agora.'),
    ).toBeInTheDocument();
  });
});
