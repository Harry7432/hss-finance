import { useState } from 'react';

import { CategoryForm } from '../../components/categories/category-form';
import { CategoryList } from '../../components/categories/category-list';
import { ErrorNotice } from '../../components/error-notice';
import { useActiveHousehold } from '../../households/use-active-household';
import { useHouseholdCategories } from '../../households/use-household-categories';
import { ApiError } from '../../lib/api-error';

function CategoriesSkeleton() {
  return (
    <div className="rounded-2xl border border-line/15 bg-surface p-6">
      <p role="status" className="sr-only">
        Carregando categorias...
      </p>
      <div className="flex flex-col gap-2">
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
      </div>
    </div>
  );
}

function resolveCategoriesErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 403) {
    return {
      title: 'Não foi possível carregar as categorias desta família.',
      description: 'Verifique se você ainda faz parte dela ou tente novamente.',
    };
  }

  return {
    title: 'Não foi possível carregar as categorias agora.',
    description: 'Tente novamente em instantes.',
  };
}

function NewCategoryPanel({
  householdId,
  isOpen,
  onOpen,
  onClose,
  onCreated,
}: {
  householdId: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="min-h-11 self-start rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
      >
        Nova categoria
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">Nova categoria</h2>
      <div className="mt-4">
        <CategoryForm
          mode="create"
          householdId={householdId}
          onCancel={onClose}
          onSuccess={onCreated}
        />
      </div>
    </div>
  );
}

function CategoriesSection() {
  const { householdsQuery, activeHousehold } = useActiveHousehold();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const categoriesQuery = useHouseholdCategories(activeHousehold?.id);

  if (householdsQuery.isPending || (activeHousehold !== undefined && categoriesQuery.isPending)) {
    return <CategoriesSkeleton />;
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
        <p className="text-ink-muted">
          Você ainda não faz parte de nenhuma família no HSS Finance.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <NewCategoryPanel
        householdId={activeHousehold.id}
        isOpen={isFormOpen}
        onOpen={() => {
          setIsFormOpen(true);
          setSuccessMessage(null);
        }}
        onClose={() => setIsFormOpen(false)}
        onCreated={() => {
          setIsFormOpen(false);
          setSuccessMessage('Categoria criada com sucesso.');
        }}
      />

      {successMessage ? (
        <p
          role="status"
          className="rounded-2xl border border-line/15 bg-surface p-4 text-sm font-medium text-income"
        >
          {successMessage}
        </p>
      ) : null}

      {categoriesQuery.isError
        ? (() => {
            const { title, description } = resolveCategoriesErrorMessage(categoriesQuery.error);

            return (
              <ErrorNotice
                title={title}
                description={description}
                onRetry={() => categoriesQuery.refetch()}
              />
            );
          })()
        : null}

      {categoriesQuery.data ? (
        categoriesQuery.data.length === 0 ? (
          <div className="rounded-2xl border border-line/15 bg-surface p-6 text-center">
            <p className="text-ink-muted">Você ainda não possui categorias.</p>
            <p className="mt-1 text-sm text-ink-muted">
              Crie uma categoria para organizar receitas e despesas.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-line/15 bg-surface p-6">
            <CategoryList
              categories={categoriesQuery.data}
              householdId={activeHousehold.id}
              canDelete={activeHousehold.role === 'owner'}
              onSuccess={setSuccessMessage}
            />
          </div>
        )
      ) : null}
    </div>
  );
}

export function CategoriesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Categorias</h1>
        <p className="mt-1 text-ink-muted">Organize suas receitas e despesas por categoria.</p>
      </div>

      <CategoriesSection />
    </div>
  );
}
