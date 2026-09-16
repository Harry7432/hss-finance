import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { Category } from '../../households/category-api';
import { useCreateTransaction } from '../../households/use-create-transaction';
import { ApiError } from '../../lib/api-error';
import { parseAmountInput } from '../../lib/amount';
import { SelectField } from '../form/select-field';
import { TextField } from '../form/text-field';

type TransactionType = 'income' | 'expense';
type TransactionStatus = 'pending' | 'paid';
type ExpenseNature = 'fixed' | 'variable';

interface TransactionFormProps {
  householdId: string;
  categories: Category[];
  onCancel: () => void;
  onSuccess: () => void;
}

function resolveCreateTransactionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CATEGORY') {
      return 'Categoria inválida para o tipo de lançamento selecionado.';
    }

    if (error.status === 403) {
      return 'Não foi possível criar o lançamento nesta família.';
    }

    if (error.status === 400) {
      return 'Verifique os dados informados e tente novamente.';
    }
  }

  return 'Não foi possível criar o lançamento agora. Tente novamente.';
}

export function TransactionForm({
  householdId,
  categories,
  onCancel,
  onSuccess,
}: TransactionFormProps) {
  const createTransactionMutation = useCreateTransaction(householdId);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<TransactionStatus>('pending');
  const [expenseNature, setExpenseNature] = useState<'' | ExpenseNature>('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [transactionDateError, setTransactionDateError] = useState<string | undefined>();

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const relevantCategories = categories.filter((category) => category.type === type);

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setCategoryId('');

    if (nextType === 'income') {
      setExpenseNature('');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (createTransactionMutation.isPending) {
      return;
    }

    const normalizedAmount = parseAmountInput(amountInput);
    const nextAmountError =
      normalizedAmount === null ? 'Informe um valor válido maior que zero.' : undefined;
    const nextTransactionDateError =
      transactionDate === '' ? 'Informe a data do lançamento.' : undefined;

    setAmountError(nextAmountError);
    setTransactionDateError(nextTransactionDateError);

    if (nextAmountError !== undefined || nextTransactionDateError !== undefined) {
      return;
    }

    try {
      await createTransactionMutation.mutateAsync({
        type,
        amount: normalizedAmount!,
        transactionDate,
        dueDate: dueDate === '' ? null : dueDate,
        categoryId: categoryId === '' ? null : categoryId,
        description: description.trim() === '' ? null : description.trim(),
        status,
        ...(type === 'expense' && expenseNature !== '' ? { expenseNature } : {}),
      });

      setType('expense');
      setAmountInput('');
      setDescription('');
      setTransactionDate('');
      setDueDate('');
      setCategoryId('');
      setStatus('pending');
      setExpenseNature('');
      setAmountError(undefined);
      setTransactionDateError(undefined);
      createTransactionMutation.reset();
      onSuccess();
    } catch {
      // Surfaced below via createTransactionMutation.isError/error.
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {createTransactionMutation.isError ? (
        <p role="alert" className="text-sm font-medium text-expense">
          {resolveCreateTransactionErrorMessage(createTransactionMutation.error)}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">Tipo</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              ref={firstFieldRef}
              type="radio"
              name="transaction-type"
              value="expense"
              checked={type === 'expense'}
              onChange={() => handleTypeChange('expense')}
              disabled={createTransactionMutation.isPending}
            />
            Despesa
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name="transaction-type"
              value="income"
              checked={type === 'income'}
              onChange={() => handleTypeChange('income')}
              disabled={createTransactionMutation.isPending}
            />
            Receita
          </label>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Valor"
          inputMode="decimal"
          placeholder="Ex.: 150,00"
          value={amountInput}
          onChange={(event) => {
            setAmountInput(event.target.value);
            setAmountError(undefined);
          }}
          error={amountError}
          disabled={createTransactionMutation.isPending}
        />

        <TextField
          label="Data do lançamento"
          type="date"
          value={transactionDate}
          onChange={(event) => {
            setTransactionDate(event.target.value);
            setTransactionDateError(undefined);
          }}
          error={transactionDateError}
          disabled={createTransactionMutation.isPending}
        />

        <TextField
          label="Descrição"
          maxLength={255}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={createTransactionMutation.isPending}
        />

        <SelectField
          label="Categoria"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          disabled={createTransactionMutation.isPending}
        >
          <option value="">Sem categoria</option>
          {relevantCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as TransactionStatus)}
          disabled={createTransactionMutation.isPending}
        >
          <option value="pending">Pendente</option>
          <option value="paid">Pago</option>
        </SelectField>

        <TextField
          label="Vencimento (opcional)"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          disabled={createTransactionMutation.isPending}
        />

        {type === 'expense' ? (
          <SelectField
            label="Natureza"
            value={expenseNature}
            onChange={(event) => setExpenseNature(event.target.value as '' | ExpenseNature)}
            disabled={createTransactionMutation.isPending}
          >
            <option value="">Não especificada</option>
            <option value="fixed">Fixa</option>
            <option value="variable">Variável</option>
          </SelectField>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={createTransactionMutation.isPending}
          className="min-h-11 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={createTransactionMutation.isPending}
          className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createTransactionMutation.isPending ? 'Salvando...' : 'Salvar lançamento'}
        </button>
      </div>
    </form>
  );
}
