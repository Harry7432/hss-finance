import { useState } from 'react';

import { useAuth } from '../../auth/auth-context';
import { AddMemberForm } from '../../components/family/add-member-form';
import { MemberList } from '../../components/family/member-list';
import { ErrorNotice } from '../../components/error-notice';
import { useActiveHousehold } from '../../households/use-active-household';
import { useHouseholdMembers } from '../../households/use-household-members';
import { ApiError } from '../../lib/api-error';

const ROLE_LABEL: Record<'owner' | 'member', string> = {
  owner: 'Proprietário',
  member: 'Membro',
};

function FamilySkeleton() {
  return (
    <div className="rounded-2xl border border-line/15 bg-surface p-6">
      <p role="status" className="sr-only">
        Carregando família...
      </p>
      <div className="flex flex-col gap-2">
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
      </div>
    </div>
  );
}

function resolveMembersErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 403) {
    return {
      title: 'Não foi possível carregar os membros desta família.',
      description: 'Verifique se você ainda faz parte dela ou tente novamente.',
    };
  }

  return {
    title: 'Não foi possível carregar os membros agora.',
    description: 'Tente novamente em instantes.',
  };
}

function NewMemberPanel({
  householdId,
  isOpen,
  onOpen,
  onClose,
  onAdded,
}: {
  householdId: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAdded: () => void;
}) {
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="min-h-11 self-start rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
      >
        Adicionar membro
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">Adicionar membro</h2>
      <div className="mt-4">
        <AddMemberForm householdId={householdId} onCancel={onClose} onSuccess={onAdded} />
      </div>
    </div>
  );
}

function FamilySection() {
  const { user } = useAuth();
  const { householdsQuery, activeHousehold } = useActiveHousehold();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const membersQuery = useHouseholdMembers(activeHousehold?.id);

  if (householdsQuery.isPending || (activeHousehold !== undefined && membersQuery.isPending)) {
    return <FamilySkeleton />;
  }

  if (householdsQuery.isError) {
    return (
      <ErrorNotice
        title="Não foi possível carregar suas famílias agora."
        description="Tente novamente em instantes."
        onRetry={() => householdsQuery.refetch()}
      />
    );
  }

  if (!activeHousehold) {
    return (
      <div className="rounded-2xl border border-line/15 bg-surface p-6 text-center">
        <p className="text-ink-muted">Você ainda não possui uma família configurada.</p>
      </div>
    );
  }

  const isOwner = activeHousehold.role === 'owner';

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-line/15 bg-surface p-6">
        <h2 className="text-lg font-semibold text-ink">{activeHousehold.name}</h2>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1">
            <dt className="text-ink-muted">Sua função:</dt>
            <dd className="font-medium text-ink">{ROLE_LABEL[activeHousehold.role]}</dd>
          </div>
          {membersQuery.data ? (
            <div className="flex gap-1">
              <dt className="text-ink-muted">Membros:</dt>
              <dd className="font-medium text-ink">{membersQuery.data.length}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {isOwner ? (
        <NewMemberPanel
          householdId={activeHousehold.id}
          isOpen={isFormOpen}
          onOpen={() => {
            setIsFormOpen(true);
            setSuccessMessage(null);
          }}
          onClose={() => setIsFormOpen(false)}
          onAdded={() => {
            setIsFormOpen(false);
            setSuccessMessage('Membro adicionado com sucesso.');
          }}
        />
      ) : (
        <p className="text-sm text-ink-muted">Somente o proprietário pode adicionar membros.</p>
      )}

      {successMessage ? (
        <p
          role="status"
          className="rounded-2xl border border-line/15 bg-surface p-4 text-sm font-medium text-income"
        >
          {successMessage}
        </p>
      ) : null}

      {membersQuery.isError
        ? (() => {
            const { title, description } = resolveMembersErrorMessage(membersQuery.error);

            return (
              <ErrorNotice
                title={title}
                description={description}
                onRetry={() => membersQuery.refetch()}
              />
            );
          })()
        : null}

      {membersQuery.data ? (
        membersQuery.data.length === 0 ? (
          <div className="rounded-2xl border border-line/15 bg-surface p-6 text-center">
            <p className="text-ink-muted">Nenhum membro encontrado.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-line/15 bg-surface p-6">
            <MemberList members={membersQuery.data} currentUserId={user?.id} />
          </div>
        )
      ) : null}
    </div>
  );
}

export function FamilyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Família</h1>
        <p className="mt-1 text-ink-muted">
          Gerencie as pessoas que compartilham esta família.
        </p>
      </div>

      <FamilySection />
    </div>
  );
}
