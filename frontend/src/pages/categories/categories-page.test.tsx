import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoriesPage } from './categories-page';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const INCOME_CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function householdsResponse(role: 'owner' | 'member' = 'owner'): Response {
  return jsonResponse({
    data: [
      {
        id: HOUSEHOLD_ID,
        name: 'Casa Sousa',
        currencyCode: 'BRL',
        role,
        createdAt: '2026-09-01T12:00:00.000Z',
      },
    ],
  });
}

function noHouseholdsResponse(): Response {
  return jsonResponse({ data: [] });
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

function categoriesResponse(categories: Array<Record<string, unknown>> = []): Response {
  return jsonResponse({ data: categories });
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockFetchByUrl(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, handler: FetchHandler) {
  fetchMock.mockImplementation(async (input, init) => handler(String(input), init));
}

function renderCategoriesPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <CategoriesPage />
    </QueryClientProvider>,
  );
}

describe('CategoriesPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('renders the page title and subtitle', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderCategoriesPage();

    expect(screen.getByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
    expect(
      screen.getByText('Organize suas receitas e despesas por categoria.'),
    ).toBeInTheDocument();
  });

  it('does not request categories before a household id is known', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderCategoriesPage();

    await screen.findByText('Você ainda não faz parte de nenhuma família no HSS Finance.');

    const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requestedUrls).toEqual(['http://localhost:3000/api/households']);
  });

  it('shows an accessible loading state while categories are being fetched', () => {
    fetchMock.mockImplementation((input) => {
      if (String(input).endsWith('/households')) return Promise.resolve(householdsResponse());
      return new Promise<Response>(() => undefined);
    });

    renderCategoriesPage();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando categorias');
  });

  it('shows an empty state when there are no categories', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) return categoriesResponse();
      return jsonResponse({ data: [] });
    });

    renderCategoriesPage();

    expect(await screen.findByText('Você ainda não possui categorias.')).toBeInTheDocument();
    expect(
      screen.getByText('Crie uma categoria para organizar receitas e despesas.'),
    ).toBeInTheDocument();
  });

  it('shows a temporary error with retry when the categories request fails', async () => {
    const user = userEvent.setup();
    let attempts = 0;

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/categories')) {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return categoriesResponse();
      }

      return jsonResponse({ data: [] });
    });

    renderCategoriesPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar as categorias agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Você ainda não possui categorias.')).toBeInTheDocument();
  });

  it('shows a safe 403 message without leaking the household id', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) {
        return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
      }
      return jsonResponse({ data: [] });
    });

    renderCategoriesPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar as categorias desta família.');
    expect(alert).not.toHaveTextContent(HOUSEHOLD_ID);
  });

  it('lists real categories grouped by type with Portuguese labels', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/categories')) {
        return categoriesResponse([
          category({ id: CATEGORY_ID, name: 'Mercado', type: 'expense' }),
          category({ id: INCOME_CATEGORY_ID, name: 'Salário', type: 'income' }),
        ]);
      }
      return jsonResponse({ data: [] });
    });

    renderCategoriesPage();

    expect(await screen.findByText('Mercado')).toBeInTheDocument();
    expect(screen.getByText('Salário')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Receitas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Despesas' })).toBeInTheDocument();
  });

  describe('nova categoria', () => {
    function mockFetchForCreateFlow() {
      let categoriesGetCallCount = 0;

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/households')) return householdsResponse();

        if (url.includes('/categories') && method === 'POST') {
          return jsonResponse(
            { data: category({ id: '55555555-5555-4555-8555-555555555555', name: 'Lazer' }) },
            201,
          );
        }

        if (url.includes('/categories')) {
          categoriesGetCallCount += 1;
          return categoriesResponse(
            categoriesGetCallCount === 1 ? [] : [category({ name: 'Lazer' })],
          );
        }

        return jsonResponse({ data: [] });
      });
    }

    it('does not show the button when there is no active household', async () => {
      mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

      renderCategoriesPage();

      await screen.findByText('Você ainda não faz parte de nenhuma família no HSS Finance.');
      expect(screen.queryByRole('button', { name: 'Nova categoria' })).not.toBeInTheDocument();
    });

    it('opens the form when the button is clicked', async () => {
      const user = userEvent.setup();
      mockFetchForCreateFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));

      expect(screen.getByRole('heading', { name: 'Nova categoria' })).toBeInTheDocument();
      expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    });

    it('closes the form and creates nothing when cancel is clicked', async () => {
      const user = userEvent.setup();
      mockFetchForCreateFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();

      const postCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
      expect(postCalls).toHaveLength(0);
    });

    it('validates that a name is required before submitting', async () => {
      const user = userEvent.setup();
      mockFetchForCreateFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
      await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));

      expect(screen.getByText('Informe o nome da categoria.')).toBeInTheDocument();

      const postCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
      expect(postCalls).toHaveLength(0);
    });

    it('creates a category with the correct payload, shows success, and refreshes the list', async () => {
      const user = userEvent.setup();
      mockFetchForCreateFlow();

      renderCategoriesPage();
      await screen.findByText('Você ainda não possui categorias.');

      await user.click(screen.getByRole('button', { name: 'Nova categoria' }));
      await user.type(screen.getByLabelText('Nome'), 'Lazer');
      await user.click(screen.getByLabelText('Receita'));
      await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));

      const successMessage = await screen.findByText('Categoria criada com sucesso.');
      expect(successMessage).toHaveAttribute('role', 'status');
      expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();

      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall?.[0]).toBe(`http://localhost:3000/api/households/${HOUSEHOLD_ID}/categories`);
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ name: 'Lazer', type: 'income' });

      expect(await screen.findAllByText('Lazer')).not.toHaveLength(0);
    });

    it('shows a friendly message on a 409 duplicate category', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories') && init?.method === 'POST') {
          return jsonResponse(
            { error: { code: 'CATEGORY_ALREADY_EXISTS', message: 'duplicate' } },
            409,
          );
        }
        if (url.includes('/categories')) return categoriesResponse();
        return jsonResponse({ data: [] });
      });

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
      await user.type(screen.getByLabelText('Nome'), 'Mercado');
      await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Já existe uma categoria com esse nome para este tipo.');
    });

    it('shows a friendly message on a 400 validation error', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories') && init?.method === 'POST') {
          return jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'bad' } }, 400);
        }
        if (url.includes('/categories')) return categoriesResponse();
        return jsonResponse({ data: [] });
      });

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
      await user.type(screen.getByLabelText('Nome'), 'Mercado');
      await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Verifique os dados informados e tente novamente.');
    });

    it('shows a friendly message on a 403 forbidden error', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories') && init?.method === 'POST') {
          return jsonResponse({ error: { code: 'FORBIDDEN', message: 'denied' } }, 403);
        }
        if (url.includes('/categories')) return categoriesResponse();
        return jsonResponse({ data: [] });
      });

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
      await user.type(screen.getByLabelText('Nome'), 'Mercado');
      await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Você não tem permissão para esta ação nesta família.');
    });
  });

  describe('editar categoria', () => {
    function mockFetchForEditFlow() {
      let categoriesGetCallCount = 0;

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/households')) return householdsResponse();

        if (url.includes('/categories') && method === 'PATCH') {
          return jsonResponse({ data: category({ name: 'Supermercado' }) });
        }

        if (url.includes('/categories')) {
          categoriesGetCallCount += 1;
          return categoriesResponse([
            category({ name: categoriesGetCallCount === 1 ? 'Mercado' : 'Supermercado' }),
          ]);
        }

        return jsonResponse({ data: [] });
      });
    }

    it('pre-fills the form with the current values', async () => {
      const user = userEvent.setup();
      mockFetchForEditFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Editar categoria Mercado' }));

      expect(screen.getByLabelText('Nome')).toHaveValue('Mercado');
      expect(screen.getByText('Tipo: Despesa')).toBeInTheDocument();
    });

    it('cancels the edit without saving', async () => {
      const user = userEvent.setup();
      mockFetchForEditFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Editar categoria Mercado' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.getByRole('button', { name: 'Editar categoria Mercado' })).toBeInTheDocument();

      const patchCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH');
      expect(patchCalls).toHaveLength(0);
    });

    it('sends the correct payload, shows success, and refreshes the list', async () => {
      const user = userEvent.setup();
      mockFetchForEditFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Editar categoria Mercado' }));

      const nameField = screen.getByLabelText('Nome');
      await user.clear(nameField);
      await user.type(nameField, 'Supermercado');
      await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));

      const successMessage = await screen.findByText('Categoria atualizada com sucesso.');
      expect(successMessage).toHaveAttribute('role', 'status');

      const patchCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH');
      expect(patchCall?.[0]).toBe(
        `http://localhost:3000/api/households/${HOUSEHOLD_ID}/categories/${CATEGORY_ID}`,
      );
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ name: 'Supermercado' });

      expect(await screen.findByText('Supermercado')).toBeInTheDocument();
    });

    it('shows a friendly message when the category no longer exists', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories') && init?.method === 'PATCH') {
          return jsonResponse({ error: { code: 'CATEGORY_NOT_FOUND', message: 'gone' } }, 404);
        }
        if (url.includes('/categories')) return categoriesResponse([category()]);
        return jsonResponse({ data: [] });
      });

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Editar categoria Mercado' }));
      await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Esta categoria não existe mais. Atualize a lista e tente novamente.',
      );
    });

    it('closes the edit form on Escape', async () => {
      const user = userEvent.setup();
      mockFetchForEditFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Editar categoria Mercado' }));
      await user.keyboard('{Escape}');

      expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editar categoria Mercado' })).toBeInTheDocument();
    });
  });

  describe('excluir categoria', () => {
    function mockFetchForDeleteFlow(role: 'owner' | 'member' = 'owner') {
      let categoriesGetCallCount = 0;

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/households')) return householdsResponse(role);

        if (url.includes('/categories') && method === 'DELETE') {
          return new Response(null, { status: 204 });
        }

        if (url.includes('/categories')) {
          categoriesGetCallCount += 1;
          return categoriesResponse(categoriesGetCallCount === 1 ? [category()] : []);
        }

        return jsonResponse({ data: [] });
      });
    }

    it('asks for confirmation before deleting', async () => {
      const user = userEvent.setup();
      mockFetchForDeleteFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Excluir categoria Mercado' }));

      expect(screen.getByText('Excluir categoria?')).toBeInTheDocument();
      expect(screen.getByText('Essa ação não poderá ser desfeita.')).toBeInTheDocument();

      const deleteCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'DELETE');
      expect(deleteCalls).toHaveLength(0);
    });

    it('cancels the deletion without calling the backend', async () => {
      const user = userEvent.setup();
      mockFetchForDeleteFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Excluir categoria Mercado' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.getByRole('button', { name: 'Excluir categoria Mercado' })).toBeInTheDocument();

      const deleteCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'DELETE');
      expect(deleteCalls).toHaveLength(0);
    });

    it('deletes the category, shows success, and refreshes the list', async () => {
      const user = userEvent.setup();
      mockFetchForDeleteFlow();

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Excluir categoria Mercado' }));
      await user.click(screen.getByRole('button', { name: 'Excluir categoria' }));

      const successMessage = await screen.findByText('Categoria excluída com sucesso.');
      expect(successMessage).toHaveAttribute('role', 'status');

      const deleteCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'DELETE');
      expect(deleteCall?.[0]).toBe(
        `http://localhost:3000/api/households/${HOUSEHOLD_ID}/categories/${CATEGORY_ID}`,
      );

      expect(await screen.findByText('Você ainda não possui categorias.')).toBeInTheDocument();
    });

    it('shows a friendly message when the category has linked transactions', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories') && init?.method === 'DELETE') {
          return jsonResponse({ error: { code: 'CATEGORY_IN_USE', message: 'in use' } }, 409);
        }
        if (url.includes('/categories')) return categoriesResponse([category()]);
        return jsonResponse({ data: [] });
      });

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Excluir categoria Mercado' }));
      await user.click(screen.getByRole('button', { name: 'Excluir categoria' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Esta categoria possui lançamentos vinculados e não pode ser excluída.',
      );
    });

    it('shows a friendly message when deletion is forbidden', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories') && init?.method === 'DELETE') {
          return jsonResponse({ error: { code: 'FORBIDDEN', message: 'denied' } }, 403);
        }
        if (url.includes('/categories')) return categoriesResponse([category()]);
        return jsonResponse({ data: [] });
      });

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Excluir categoria Mercado' }));
      await user.click(screen.getByRole('button', { name: 'Excluir categoria' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Você não tem permissão para excluir esta categoria.');
    });

    it('shows a friendly message when the category no longer exists', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse();
        if (url.includes('/categories') && init?.method === 'DELETE') {
          return jsonResponse({ error: { code: 'CATEGORY_NOT_FOUND', message: 'gone' } }, 404);
        }
        if (url.includes('/categories')) return categoriesResponse([category()]);
        return jsonResponse({ data: [] });
      });

      renderCategoriesPage();
      await user.click(await screen.findByRole('button', { name: 'Excluir categoria Mercado' }));
      await user.click(screen.getByRole('button', { name: 'Excluir categoria' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Esta categoria não existe mais. Atualize a lista e tente novamente.',
      );
    });

    it('disables deletion for a member and explains why', async () => {
      mockFetchForDeleteFlow('member');

      renderCategoriesPage();

      const deleteButton = await screen.findByRole('button', { name: 'Excluir categoria Mercado' });
      expect(deleteButton).toBeDisabled();
    });

    it('allows an owner to see the delete action', async () => {
      mockFetchForDeleteFlow('owner');

      renderCategoriesPage();

      const deleteButton = await screen.findByRole('button', { name: 'Excluir categoria Mercado' });
      expect(deleteButton).toBeEnabled();
    });
  });
});
