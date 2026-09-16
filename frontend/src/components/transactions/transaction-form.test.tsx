import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '../../households/category-api';
import { TransactionForm } from './transaction-form';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const EXPENSE_CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const INCOME_CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function createdTransactionResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(
    {
      data: {
        id: '11111111-1111-4111-8111-111111111111',
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

const categories: Category[] = [
  {
    id: EXPENSE_CATEGORY_ID,
    name: 'Mercado',
    type: 'expense',
    color: null,
    icon: null,
    isDefault: false,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  },
  {
    id: INCOME_CATEGORY_ID,
    name: 'Salário',
    type: 'income',
    color: null,
    icon: null,
    isDefault: false,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  },
];

function renderForm(overrides: Partial<{ onCancel: () => void; onSuccess: () => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onCancel = overrides.onCancel ?? vi.fn();
  const onSuccess = overrides.onSuccess ?? vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <TransactionForm
        householdId={HOUSEHOLD_ID}
        categories={categories}
        onCancel={onCancel}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );

  return { queryClient, onCancel, onSuccess };
}

function lastPostBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    (entry) => String(entry[0]).includes('/transactions') && entry[1]?.method === 'POST',
  );
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

async function fillMinimumValidFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Valor'), '150');
  fireEvent.change(screen.getByLabelText('Data do lançamento'), {
    target: { value: '2026-09-13' },
  });
}

describe('TransactionForm', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('calls onCancel without submitting anything', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('rejects submission with an invalid amount and does not call the API', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText('Data do lançamento'), {
      target: { value: '2026-09-13' },
    });
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    expect(await screen.findByText('Informe um valor válido maior que zero.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects submission without a transaction date and does not call the API', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Valor'), '150');
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    expect(await screen.findByText('Informe a data do lançamento.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only type, amount, and transactionDate when nothing else is filled', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(createdTransactionResponse());
    renderForm();

    await fillMinimumValidFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPostBody(fetchMock)).toEqual({
      type: 'expense',
      amount: '150.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      categoryId: null,
      description: null,
      status: 'pending',
    });
  });

  it('sends the full expense payload, accepting a comma decimal amount', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(createdTransactionResponse());
    renderForm();

    await user.type(screen.getByLabelText('Valor'), '150,90');
    fireEvent.change(screen.getByLabelText('Data do lançamento'), {
      target: { value: '2026-09-13' },
    });
    await user.type(screen.getByLabelText('Descrição'), 'Mercado');
    await user.selectOptions(screen.getByLabelText('Categoria'), EXPENSE_CATEGORY_ID);
    await user.selectOptions(screen.getByLabelText('Status'), 'paid');
    fireEvent.change(screen.getByLabelText('Vencimento (opcional)'), {
      target: { value: '2026-09-20' },
    });
    await user.selectOptions(screen.getByLabelText('Natureza'), 'variable');

    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPostBody(fetchMock)).toEqual({
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
      dueDate: '2026-09-20',
      categoryId: EXPENSE_CATEGORY_ID,
      description: 'Mercado',
      status: 'paid',
      expenseNature: 'variable',
    });
  });

  it('sends the correct payload for an income, without an expenseNature field', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(createdTransactionResponse({ type: 'income' }));
    renderForm();

    await user.click(screen.getByRole('radio', { name: 'Receita' }));
    await user.type(screen.getByLabelText('Valor'), '3000');
    fireEvent.change(screen.getByLabelText('Data do lançamento'), {
      target: { value: '2026-09-13' },
    });
    await user.selectOptions(screen.getByLabelText('Categoria'), INCOME_CATEGORY_ID);

    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = lastPostBody(fetchMock);
    expect(body).toEqual({
      type: 'income',
      amount: '3000.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      categoryId: INCOME_CATEGORY_ID,
      description: null,
      status: 'pending',
    });
    expect(body).not.toHaveProperty('expenseNature');
  });

  it('hides the natureza field for income and shows it again for expense', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByLabelText('Natureza')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Receita' }));
    expect(screen.queryByLabelText('Natureza')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Despesa' }));
    expect(screen.getByLabelText('Natureza')).toBeInTheDocument();
  });

  it('resets the selected category when the type changes', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText('Categoria'), EXPENSE_CATEGORY_ID);
    await user.click(screen.getByRole('radio', { name: 'Receita' }));

    expect(screen.getByLabelText('Categoria')).toHaveValue('');
  });

  it('only offers categories matching the selected type', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByRole('option', { name: 'Mercado' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Salário' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Receita' }));

    expect(screen.queryByRole('option', { name: 'Mercado' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Salário' })).toBeInTheDocument();
  });

  it('trims the description and sends null for a blank one', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(createdTransactionResponse());
    renderForm();

    await fillMinimumValidFields(user);
    await user.type(screen.getByLabelText('Descrição'), '   ');

    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPostBody(fetchMock).description).toBeNull();
  });

  it('shows a loading state and disables the form while submitting', async () => {
    const user = userEvent.setup();
    let resolveRequest: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderForm();

    await fillMinimumValidFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    const submitButton = await screen.findByRole('button', { name: 'Salvando...' });
    expect(submitButton).toBeDisabled();
    expect(screen.getByLabelText('Valor')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

    resolveRequest(createdTransactionResponse());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar lançamento' })).toBeEnabled(),
    );
  });

  it('ignores a second submit while the first is still pending', async () => {
    const user = userEvent.setup();
    let resolveRequest: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderForm();

    await fillMinimumValidFields(user);

    const submitButton = screen.getByRole('button', { name: 'Salvar lançamento' });
    await user.click(submitButton);
    await user.click(submitButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRequest(createdTransactionResponse());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar lançamento' })).toBeEnabled(),
    );
  });

  it('shows an error message on a 400 validation error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' } },
        400,
      ),
    );
    renderForm();

    await fillMinimumValidFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Verifique os dados informados e tente novamente.');
  });

  it('shows a safe message on a 403 error without leaking the household id', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403),
    );
    renderForm();

    await fillMinimumValidFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível criar o lançamento nesta família.');
    expect(alert).not.toHaveTextContent(HOUSEHOLD_ID);
  });

  it('shows an invalid category message', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'INVALID_CATEGORY', message: 'Invalid category' } }, 400),
    );
    renderForm();

    await fillMinimumValidFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Categoria inválida para o tipo de lançamento selecionado.');
  });

  it('shows a network error message', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderForm();

    await fillMinimumValidFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível criar o lançamento agora. Tente novamente.');
  });

  it('calls onSuccess and resets the form after a successful submit', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(createdTransactionResponse());
    const onSuccess = vi.fn();
    renderForm({ onSuccess });

    await fillMinimumValidFields(user);
    await user.type(screen.getByLabelText('Descrição'), 'Mercado');
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

    expect(screen.getByLabelText('Valor')).toHaveValue('');
    expect(screen.getByLabelText('Data do lançamento')).toHaveValue('');
    expect(screen.getByLabelText('Descrição')).toHaveValue('');
  });

  it('invalidates transactions and related summary queries for the household on success', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    fetchMock.mockResolvedValue(createdTransactionResponse());

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionForm
          householdId={HOUSEHOLD_ID}
          categories={categories}
          onCancel={vi.fn()}
          onSuccess={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await fillMinimumValidFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(['transactions', HOUSEHOLD_ID]);
    expect(invalidatedKeys).toContainEqual(['household-summary', HOUSEHOLD_ID]);
    expect(invalidatedKeys).toContainEqual(['household-category-summary', HOUSEHOLD_ID]);
    expect(invalidatedKeys).toContainEqual(['household-monthly-summary', HOUSEHOLD_ID]);
  });
});
