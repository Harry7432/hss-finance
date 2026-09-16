import type { Category } from '../../households/category-api';
import type { TransactionFiltersValue } from '../../households/select-transactions';
import { SelectField } from '../form/select-field';
import { TextField } from '../form/text-field';

interface TransactionFiltersProps {
  value: TransactionFiltersValue;
  categories: Category[];
  onChange: (value: TransactionFiltersValue) => void;
}

export function TransactionFilters({ value, categories, onChange }: TransactionFiltersProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <SelectField
        label="Tipo"
        value={value.type}
        onChange={(event) =>
          onChange({ ...value, type: event.target.value as TransactionFiltersValue['type'] })
        }
      >
        <option value="all">Todos</option>
        <option value="income">Receitas</option>
        <option value="expense">Despesas</option>
      </SelectField>

      <SelectField
        label="Status"
        value={value.status}
        onChange={(event) =>
          onChange({ ...value, status: event.target.value as TransactionFiltersValue['status'] })
        }
      >
        <option value="all">Todos</option>
        <option value="paid">Pago</option>
        <option value="pending">Pendente</option>
      </SelectField>

      {categories.length > 0 ? (
        <SelectField
          label="Categoria"
          value={value.categoryId}
          onChange={(event) => onChange({ ...value, categoryId: event.target.value })}
        >
          <option value="">Todas</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      <TextField
        label="De"
        type="date"
        value={value.startDate}
        onChange={(event) => onChange({ ...value, startDate: event.target.value })}
      />

      <TextField
        label="Até"
        type="date"
        value={value.endDate}
        onChange={(event) => onChange({ ...value, endDate: event.target.value })}
      />
    </div>
  );
}
