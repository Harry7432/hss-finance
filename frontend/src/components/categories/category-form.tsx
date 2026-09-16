import { useEffect, useState, type FormEvent } from 'react';

import type { Category } from '../../households/category-api';
import { useCreateCategory } from '../../households/use-create-category';
import { useUpdateCategory } from '../../households/use-update-category';
import { ApiError } from '../../lib/api-error';
import { TextField } from '../form/text-field';

type CategoryType = 'income' | 'expense';

const TYPE_LABEL: Record<CategoryType, string> = {
  income: 'Receita',
  expense: 'Despesa',
};

interface CategoryFormProps {
  householdId: string;
  onCancel: () => void;
  onSuccess: () => void;
}

interface CreateCategoryFormProps extends CategoryFormProps {
  mode: 'create';
}

interface EditCategoryFormProps extends CategoryFormProps {
  mode: 'edit';
  category: Category;
}

function resolveCategoryErrorMessage(error: unknown, mode: 'create' | 'edit'): string {
  if (error instanceof ApiError) {
    if (error.code === 'CATEGORY_ALREADY_EXISTS') {
      return 'Já existe uma categoria com esse nome para este tipo.';
    }

    if (error.code === 'CATEGORY_NOT_FOUND') {
      return 'Esta categoria não existe mais. Atualize a lista e tente novamente.';
    }

    if (error.status === 403) {
      return 'Você não tem permissão para esta ação nesta família.';
    }

    if (error.status === 400) {
      return 'Verifique os dados informados e tente novamente.';
    }
  }

  return mode === 'create'
    ? 'Não foi possível criar a categoria agora. Tente novamente.'
    : 'Não foi possível atualizar a categoria agora. Tente novamente.';
}

export function CategoryForm(props: CreateCategoryFormProps | EditCategoryFormProps) {
  const { householdId, onCancel, onSuccess, mode } = props;
  const createCategoryMutation = useCreateCategory(householdId);
  const updateCategoryMutation = useUpdateCategory(householdId);
  const mutation = mode === 'create' ? createCategoryMutation : updateCategoryMutation;

  const [name, setName] = useState(mode === 'edit' ? props.category.name : '');
  const [type, setType] = useState<CategoryType>(mode === 'edit' ? props.category.type : 'expense');
  const [nameError, setNameError] = useState<string | undefined>();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mutation.isPending) {
      return;
    }

    const trimmedName = name.trim();
    const nextNameError = trimmedName === '' ? 'Informe o nome da categoria.' : undefined;
    setNameError(nextNameError);

    if (nextNameError !== undefined) {
      return;
    }

    try {
      if (mode === 'create') {
        await createCategoryMutation.mutateAsync({ name: trimmedName, type });
        setName('');
        setType('expense');
      } else {
        await updateCategoryMutation.mutateAsync({
          categoryId: props.category.id,
          input: { name: trimmedName },
        });
      }

      setNameError(undefined);
      mutation.reset();
      onSuccess();
    } catch {
      // Surfaced below via mutation.isError/error.
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {mutation.isError ? (
        <p role="alert" className="text-sm font-medium text-expense">
          {resolveCategoryErrorMessage(mutation.error, mode)}
        </p>
      ) : null}

      <TextField
        autoFocus
        label="Nome"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setNameError(undefined);
        }}
        error={nameError}
        disabled={mutation.isPending}
      />

      {mode === 'create' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">Tipo</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="category-type"
                value="expense"
                checked={type === 'expense'}
                onChange={() => setType('expense')}
                disabled={mutation.isPending}
              />
              Despesa
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="category-type"
                value="income"
                checked={type === 'income'}
                onChange={() => setType('income')}
                disabled={mutation.isPending}
              />
              Receita
            </label>
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-ink-muted">Tipo: {TYPE_LABEL[props.category.type]}</p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={mutation.isPending}
          className="min-h-11 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Salvando...' : 'Salvar categoria'}
        </button>
      </div>
    </form>
  );
}
