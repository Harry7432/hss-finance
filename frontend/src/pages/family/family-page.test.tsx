import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '../../auth/auth-context';
import { FamilyPage } from './family-page';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const OWNER_USER_ID = '4f8b5484-e733-45f9-9744-a756b1baa1ef';
const MEMBER_USER_ID = '55555555-5555-4555-8555-555555555555';

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

function member(overrides: Record<string, unknown> = {}) {
  return {
    userId: OWNER_USER_ID,
    name: 'Harry Sousa',
    email: 'harry@example.com',
    role: 'owner',
    joinedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

function membersResponse(members: Array<Record<string, unknown>> = [member()]): Response {
  return jsonResponse({ data: members });
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockFetchByUrl(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, handler: FetchHandler) {
  fetchMock.mockImplementation(async (input, init) => handler(String(input), init));
}

function renderFamilyPage(overrides: Partial<AuthContextValue> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const value: AuthContextValue = {
    status: 'authenticated',
    user: {
      id: OWNER_USER_ID,
      name: 'Harry Sousa',
      email: 'harry@example.com',
      createdAt: '2026-09-01T12:00:00.000Z',
    },
    login: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext value={value}>
        <FamilyPage />
      </AuthContext>
    </QueryClientProvider>,
  );
}

describe('FamilyPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('renders the page title and subtitle', () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderFamilyPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Família' })).toBeInTheDocument();
    expect(
      screen.getByText('Gerencie as pessoas que compartilham esta família.'),
    ).toBeInTheDocument();
  });

  it('shows an accessible loading state while data is being fetched', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    renderFamilyPage();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando família');
  });

  it('does not request members before a household id is known', async () => {
    mockFetchByUrl(fetchMock, () => noHouseholdsResponse());

    renderFamilyPage();

    await screen.findByText('Você ainda não possui uma família configurada.');

    const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requestedUrls).toEqual(['http://localhost:3000/api/households']);
  });

  it('shows a temporary error with retry when the households request fails', async () => {
    const user = userEvent.setup();

    mockFetchByUrl(fetchMock, () => {
      throw new TypeError('Failed to fetch');
    });

    renderFamilyPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar suas famílias agora.');

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/members')) return membersResponse();
      return jsonResponse({ data: [] });
    });

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Casa Sousa')).toBeInTheDocument();
  });

  it('shows a temporary error with retry when the members request fails', async () => {
    const user = userEvent.setup();
    let attempts = 0;

    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();

      if (url.includes('/members')) {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return membersResponse();
      }

      return jsonResponse({ data: [] });
    });

    renderFamilyPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os membros agora.');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Harry Sousa')).toBeInTheDocument();
  });

  it('shows a safe 403 message without leaking the household id when members fail', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse();
      if (url.includes('/members')) {
        return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
      }
      return jsonResponse({ data: [] });
    });

    renderFamilyPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os membros desta família.');
    expect(alert).not.toHaveTextContent(HOUSEHOLD_ID);
  });

  it('shows the active household name and the current user role', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse('owner');
      if (url.includes('/members')) return membersResponse();
      return jsonResponse({ data: [] });
    });

    renderFamilyPage();

    expect(await screen.findByText('Casa Sousa')).toBeInTheDocument();
    const roleTerm = screen.getByText('Sua função:');
    expect(roleTerm.nextElementSibling).toHaveTextContent('Proprietário');
  });

  it('lists real members with owner/member role labels and highlights the current user', async () => {
    mockFetchByUrl(fetchMock, (url) => {
      if (url.endsWith('/households')) return householdsResponse('owner');
      if (url.includes('/members')) {
        return membersResponse([
          member({ userId: OWNER_USER_ID, name: 'Harry Sousa', role: 'owner' }),
          member({
            userId: MEMBER_USER_ID,
            name: 'Outro Usuario',
            email: 'outro@example.com',
            role: 'member',
          }),
        ]);
      }
      return jsonResponse({ data: [] });
    });

    renderFamilyPage();

    await screen.findByText('Harry Sousa');
    const memberList = within(screen.getByRole('list'));
    expect(memberList.getByText('Outro Usuario')).toBeInTheDocument();
    expect(memberList.getByText('Proprietário')).toBeInTheDocument();
    expect(memberList.getByText('Membro')).toBeInTheDocument();
    expect(memberList.getByText('(Você)')).toBeInTheDocument();
  });

  describe('permissões', () => {
    it('shows the add-member button for an owner', async () => {
      mockFetchByUrl(fetchMock, (url) => {
        if (url.endsWith('/households')) return householdsResponse('owner');
        if (url.includes('/members')) return membersResponse();
        return jsonResponse({ data: [] });
      });

      renderFamilyPage();

      expect(await screen.findByRole('button', { name: 'Adicionar membro' })).toBeInTheDocument();
    });

    it('does not show the add-member button for a member and explains why', async () => {
      mockFetchByUrl(fetchMock, (url) => {
        if (url.endsWith('/households')) return householdsResponse('member');
        if (url.includes('/members')) return membersResponse();
        return jsonResponse({ data: [] });
      });

      renderFamilyPage({
        user: {
          id: MEMBER_USER_ID,
          name: 'Outro Usuario',
          email: 'outro@example.com',
          createdAt: '2026-09-01T12:00:00.000Z',
        },
      });

      await screen.findByText('Harry Sousa');
      expect(screen.queryByRole('button', { name: 'Adicionar membro' })).not.toBeInTheDocument();
      expect(
        screen.getByText('Somente o proprietário pode adicionar membros.'),
      ).toBeInTheDocument();
    });
  });

  describe('adicionar membro', () => {
    function mockFetchForAddFlow() {
      let membersGetCallCount = 0;

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/households')) return householdsResponse('owner');

        if (url.includes('/members') && method === 'POST') {
          return jsonResponse(
            {
              data: member({
                userId: MEMBER_USER_ID,
                name: 'Novo Membro',
                email: 'novo@example.com',
                role: 'member',
              }),
            },
            201,
          );
        }

        if (url.includes('/members')) {
          membersGetCallCount += 1;
          return membersResponse(
            membersGetCallCount === 1
              ? [member()]
              : [
                  member(),
                  member({
                    userId: MEMBER_USER_ID,
                    name: 'Novo Membro',
                    email: 'novo@example.com',
                    role: 'member',
                  }),
                ],
          );
        }

        return jsonResponse({ data: [] });
      });
    }

    it('opens the form when the button is clicked', async () => {
      const user = userEvent.setup();
      mockFetchForAddFlow();

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));

      expect(screen.getByRole('heading', { name: 'Adicionar membro' })).toBeInTheDocument();
      expect(screen.getByLabelText('E-mail do usuário')).toBeInTheDocument();
      expect(
        screen.getByText('O usuário precisa ter uma conta no HSS Finance.'),
      ).toBeInTheDocument();
    });

    it('closes the form and adds nothing when cancel is clicked', async () => {
      const user = userEvent.setup();
      mockFetchForAddFlow();

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByLabelText('E-mail do usuário')).not.toBeInTheDocument();

      const postCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
      expect(postCalls).toHaveLength(0);
    });

    it('closes the form on Escape', async () => {
      const user = userEvent.setup();
      mockFetchForAddFlow();

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));
      await user.keyboard('{Escape}');

      expect(screen.queryByLabelText('E-mail do usuário')).not.toBeInTheDocument();
    });

    it('validates that an email is required before submitting', async () => {
      const user = userEvent.setup();
      mockFetchForAddFlow();

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));
      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));

      expect(screen.getByText('Informe o e-mail do usuário.')).toBeInTheDocument();

      const postCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
      expect(postCalls).toHaveLength(0);
    });

    it('sends the correct payload, shows success, resets and refreshes the list', async () => {
      const user = userEvent.setup();
      mockFetchForAddFlow();

      renderFamilyPage();
      await screen.findByText('Harry Sousa');

      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));
      await user.type(screen.getByLabelText('E-mail do usuário'), 'novo@example.com');
      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));

      const successMessage = await screen.findByText('Membro adicionado com sucesso.');
      expect(successMessage).toHaveAttribute('role', 'status');
      expect(screen.queryByLabelText('E-mail do usuário')).not.toBeInTheDocument();

      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall?.[0]).toBe(`http://localhost:3000/api/households/${HOUSEHOLD_ID}/members`);
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ email: 'novo@example.com' });

      expect(await screen.findByText('Novo Membro')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));
      expect(screen.getByLabelText('E-mail do usuário')).toHaveValue('');
    });

    it('blocks a double submit while the mutation is pending', async () => {
      const user = userEvent.setup();
      let resolvePost: (() => void) | undefined;

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/households')) return householdsResponse('owner');

        if (url.includes('/members') && method === 'POST') {
          return new Promise<Response>((resolve) => {
            resolvePost = () =>
              resolve(jsonResponse({ data: member({ role: 'member' }) }, 201));
          });
        }

        if (url.includes('/members')) return membersResponse();

        return jsonResponse({ data: [] });
      });

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));
      await user.type(screen.getByLabelText('E-mail do usuário'), 'novo@example.com');
      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));

      const submitButton = await screen.findByRole('button', { name: 'Adicionando...' });
      expect(submitButton).toBeDisabled();

      await user.click(submitButton);

      const postCallsBeforeResolve = fetchMock.mock.calls.filter(
        (call) => call[1]?.method === 'POST',
      );
      expect(postCallsBeforeResolve).toHaveLength(1);

      resolvePost?.();
      await screen.findByText('Membro adicionado com sucesso.');
    });

    it('shows a friendly message when the user is not found', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse('owner');
        if (url.includes('/members') && init?.method === 'POST') {
          return jsonResponse(
            { error: { code: 'USER_NOT_FOUND', message: 'User not found' } },
            404,
          );
        }
        if (url.includes('/members')) return membersResponse();
        return jsonResponse({ data: [] });
      });

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));
      await user.type(screen.getByLabelText('E-mail do usuário'), 'missing@example.com');
      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Não encontramos um usuário com esse e-mail no HSS Finance.');
    });

    it('shows a friendly message when the user is already a member', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse('owner');
        if (url.includes('/members') && init?.method === 'POST') {
          return jsonResponse(
            {
              error: {
                code: 'ALREADY_HOUSEHOLD_MEMBER',
                message: 'User is already a household member',
              },
            },
            409,
          );
        }
        if (url.includes('/members')) return membersResponse();
        return jsonResponse({ data: [] });
      });

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));
      await user.type(screen.getByLabelText('E-mail do usuário'), 'harry@example.com');
      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Este usuário já faz parte desta família.');
    });

    it('shows a friendly message on a 403 forbidden error', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse('owner');
        if (url.includes('/members') && init?.method === 'POST') {
          return jsonResponse({ error: { code: 'FORBIDDEN', message: 'denied' } }, 403);
        }
        if (url.includes('/members')) return membersResponse();
        return jsonResponse({ data: [] });
      });

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));
      await user.type(screen.getByLabelText('E-mail do usuário'), 'membro@example.com');
      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Somente o proprietário pode adicionar membros.');
    });

    it('shows a friendly message on a network/5xx error', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(fetchMock, (url, init) => {
        if (url.endsWith('/households')) return householdsResponse('owner');
        if (url.includes('/members') && init?.method === 'POST') {
          return jsonResponse(
            { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
            500,
          );
        }
        if (url.includes('/members')) return membersResponse();
        return jsonResponse({ data: [] });
      });

      renderFamilyPage();
      await user.click(await screen.findByRole('button', { name: 'Adicionar membro' }));
      await user.type(screen.getByLabelText('E-mail do usuário'), 'membro@example.com');
      await user.click(screen.getByRole('button', { name: 'Adicionar membro' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Não foi possível adicionar o membro agora. Tente novamente.');
    });
  });
});
