import { useState } from 'react';

import type { Category } from '../../households/category-api';
import { useDeleteCategory } from '../../households/use-delete-category';
import { ApiError } from '../../lib/api-error';
import { CategoryForm } from './category-form';

type ItemMode = 'view' | 'edit' | 'delete';

function resolveDeleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'CATEGORY_IN_USE') {
      return 'Esta categoria possui lançamentos vinculados e não pode ser excluída.';
    }

    if (error.code === 'CATEGORY_NOT_FOUND') {
      return 'Esta categoria não existe mais. Atualize a lista e tente novamente.';
    }

    if (error.status === 403) {
      return 'Você não tem permissão para excluir esta categoria.';
    }
  }

  return 'Não foi possível excluir a categoria agora. Tente novamente.';
}

export function CategoryListItem({
  householdId,
  category,
  canDelete,
  onSuccess,
}: {
  householdId: string;
  category: Category;
  canDelete: boolean;
  onSuccess: (message: string) => void;
}) {
  const [mode, setMode] = useState<ItemMode>('view');
  const deleteCategoryMutation = useDeleteCategory(householdId);

  async function handleConfirmDelete() {
    if (deleteCategoryMutation.isPending) {
      return;
    }

    try {
      await deleteCategoryMutation.mutateAsync(category.id);
      deleteCategoryMutation.reset();
      setMode('view');
      onSuccess('Categoria excluída com sucesso.');
    } catch {
      // Surfaced below via deleteCategoryMutation.isError/error.
    }
  }

  if (mode === 'edit') {
    return (
      <li className="rounded-xl border border-line/15 p-4">
        <CategoryForm
          mode="edit"
          householdId={householdId}
          category={category}
          onCancel={() => setMode('view')}
          onSuccess={() => {
            setMode('view');
            onSuccess('Categoria atualizada com sucesso.');
          }}
        />
      </li>
    );
  }

  if (mode === 'delete') {
    return (
      <li className="rounded-xl border border-line/15 p-4">
        <div
          role="group"
          aria-label={`Excluir categoria ${category.name}`}
          className="flex flex-col gap-3"
        >
          {deleteCategoryMutation.isError ? (
            <p role="alert" className="text-sm font-medium text-expense">
              {resolveDeleteErrorMessage(deleteCategoryMutation.error)}
            </p>
          ) : null}
          <div>
            <p className="font-medium text-ink">Excluir categoria?</p>
            <p className="mt-1 text-sm text-ink-muted">Essa ação não poderá ser desfeita.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                deleteCategoryMutation.reset();
                setMode('view');
              }}
              disabled={deleteCategoryMutation.isPending}
              className="min-h-11 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteCategoryMutation.isPending}
              className="min-h-11 rounded-lg border border-expense/40 px-4 text-sm font-semibold text-expense transition-colors hover:bg-expense/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteCategoryMutation.isPending ? 'Excluindo...' : 'Excluir categoria'}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line/15 p-4">
      <span className="min-w-0 truncate font-medium text-ink">{category.name}</span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setMode('edit')}
          aria-label={`Editar categoria ${category.name}`}
          className="min-h-11 rounded-lg border border-line/25 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-alt"
        >
          Editar
        </button>
        {canDelete ? (
          <button
            type="button"
            onClick={() => setMode('delete')}
            aria-label={`Excluir categoria ${category.name}`}
            className="min-h-11 rounded-lg border border-line/25 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-alt"
          >
            Excluir
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-label={`Excluir categoria ${category.name}`}
            aria-describedby={`category-delete-hint-${category.id}`}
            className="min-h-11 cursor-not-allowed rounded-lg border border-line/25 px-3 text-sm font-medium text-ink-muted opacity-60"
          >
            Excluir
          </button>
        )}
      </div>
      {canDelete ? null : (
        <span id={`category-delete-hint-${category.id}`} className="sr-only">
          Apenas o dono da família pode excluir categorias.
        </span>
      )}
    </li>
  );
}
