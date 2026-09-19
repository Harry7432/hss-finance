import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AsaasBalanceCard } from './asaas-balance-card';

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
      <AsaasBalanceCard householdId={HOUSEHOLD_ID} />
    </QueryClientProvider>,
  );
}

describe('AsaasBalanceCard', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows an accessible loading state while the balance is being fetched', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderCard();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando saldo');
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it('shows the balance once loaded', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { balance: 987.65 } }));

    renderCard();

    expect(await screen.findByText(/R\$\s987,65/)).toBeInTheDocument();
  });

  it('shows a distinct message when the provider is not configured', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'not configured' } }, 503),
    );

    renderCard();

    expect(
      await screen.findByText('A integração com o Asaas não está configurada.'),
    ).toBeInTheDocument();
  });

  it('shows a temporary error with retry on a generic failure', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ data: { balance: 100 } }));

    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível consultar o saldo agora.',
    );

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText(/R\$\s100,00/)).toBeInTheDocument();
  });
});
