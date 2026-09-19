import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AsaasPage } from './asaas-page';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';

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

function renderAsaasPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AsaasPage />
    </QueryClientProvider>,
  );
}

describe('AsaasPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('always shows the connection card, never an API key', async () => {
    fetchMock.mockResolvedValueOnce(householdsResponse());
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));

    renderAsaasPage();

    expect(await screen.findByText('Conectada ao ambiente Sandbox')).toBeInTheDocument();
    expect(screen.getByText('Sandbox / Homologação')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[Aa]pi[_-]?[Kk]ey/);
  });

  it('shows the balance and statement cards for the active household', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/balance')) return jsonResponse({ data: { balance: 500.25 } });
      if (url.includes('/financial-transactions')) {
        return jsonResponse({
          data: { transactions: [], totalCount: 0, hasMore: false, offset: 0, limit: 20 },
        });
      }

      return jsonResponse({ data: null });
    });

    renderAsaasPage();

    expect(await screen.findByText(/R\$\s500,25/)).toBeInTheDocument();
    expect(
      await screen.findByText('Nenhuma movimentação encontrada na conta Asaas ainda.'),
    ).toBeInTheDocument();
  });

  it('shows a distinct message when the user has no household yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    renderAsaasPage();

    expect(
      await screen.findByText('Você ainda não faz parte de nenhuma família no HSS Finance.'),
    ).toBeInTheDocument();
  });
});
