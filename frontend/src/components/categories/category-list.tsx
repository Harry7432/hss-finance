import type { Category } from '../../households/category-api';
import { CategoryListItem } from './category-list-item';

function CategoryGroup({
  title,
  categories,
  householdId,
  canDelete,
  onSuccess,
}: {
  title: string;
  categories: Category[];
  householdId: string;
  canDelete: boolean;
  onSuccess: (message: string) => void;
}) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-ink-muted">{title}</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {categories.map((category) => (
          <CategoryListItem
            key={category.id}
            householdId={householdId}
            category={category}
            canDelete={canDelete}
            onSuccess={onSuccess}
          />
        ))}
      </ul>
    </div>
  );
}

export function CategoryList({
  categories,
  householdId,
  canDelete,
  onSuccess,
}: {
  categories: Category[];
  householdId: string;
  canDelete: boolean;
  onSuccess: (message: string) => void;
}) {
  const incomeCategories = categories.filter((category) => category.type === 'income');
  const expenseCategories = categories.filter((category) => category.type === 'expense');

  return (
    <div className="flex flex-col gap-6">
      <CategoryGroup
        title="Receitas"
        categories={incomeCategories}
        householdId={householdId}
        canDelete={canDelete}
        onSuccess={onSuccess}
      />
      <CategoryGroup
        title="Despesas"
        categories={expenseCategories}
        householdId={householdId}
        canDelete={canDelete}
        onSuccess={onSuccess}
      />
    </div>
  );
}
