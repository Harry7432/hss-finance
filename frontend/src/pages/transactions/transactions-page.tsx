import { useState } from 'react';

import type { Category } from '../../households/category-api';
import { useActiveHousehold } from '../../households/use-active-household';
import { useHouseholdCategories } from '../../households/use-household-categories';
import { useTransactions } from '../../households/use-transactions';
import {
  buildCategoryNameMap,
  buildTransactionRows,
  DEFAULT_TRANSACTION_FILTERS,
  hasActiveTransactionFilters,
  toTransactionListFilters,
  type TransactionFiltersValue,
} from '../../households/select-transactions';
import type { TransactionListResult } from '../../households/transaction-api';
import { ApiError } from '../../lib/api-error';
import { getTodayInSaoPaulo } from '../../lib/date-only';
import { ErrorNotice } from '../../components/error-notice';
import { TransactionFilters } from '../../components/transactions/transaction-filters';
import { TransactionForm } from '../../components/transactions/transaction-form';
import { TransactionsList } from '../../components/transactions/transactions-list';
import { TransactionsPagination } from '../../components/transactions/transactions-pagination';

function TransactionsSkeleton() {
  return (
    <div className="rounded-2xl border border-line/15 bg-surface p-6">
      <p role="status" className="sr-only">
        Carregando lançamentos...
      </p>
      <div className="flex flex-col gap-2">
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
        <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-page" />
      </div>
    </div>
  );
}

function resolveTransactionsErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 403) {
    return {
      title: 'Não foi possível carregar os lançamentos desta família.',
      description: 'Verifique se você ainda faz parte dela ou tente novamente.',
    };
  }

  return {
    title: 'Não foi possível carregar os lançamentos agora.',
    description: 'Tente novamente em instantes.',
  };
}

function TransactionsResults({
  result,
  categories,
  filters,
  page,
  onPageChange,
}: {
  result: TransactionListResult;
  categories: Category[];
  filters: TransactionFiltersValue;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const today = getTodayInSaoPaulo();
  const categoryNamesById = buildCategoryNameMap(categories);
  const rows = buildTransactionRows(result.transactions, categoryNamesById, today);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-line/15 bg-surface p-6 text-center">
        <p className="text-ink-muted">
          {hasActiveTransactionFilters(filters)
            ? 'Nenhum lançamento encontrado para os filtros selecionados.'
            : 'Você ainda não possui lançamentos.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line/15 bg-surface p-6">
      <TransactionsList rows={rows} />
      <div className="mt-4">
        <TransactionsPagination
          page={page}
          totalPages={result.meta.totalPages}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}

function NewTransactionPanel({
  householdId,
  categories,
  isOpen,
  onOpen,
  onClose,
  onCreated,
}: {
  householdId: string;
  categories: Category[];
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
        Novo lançamento
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">Novo lançamento</h2>
      <div className="mt-4">
        <TransactionForm
          householdId={householdId}
          categories={categories}
          onCancel={onClose}
          onSuccess={onCreated}
        />
      </div>
    </div>
  );
}

function TransactionsSection() {
  const { householdsQuery, activeHousehold } = useActiveHousehold();
  const [filters, setFilters] = useState<TransactionFiltersValue>(DEFAULT_TRANSACTION_FILTERS);
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const categoriesQuery = useHouseholdCategories(activeHousehold?.id);
  const transactionsQuery = useTransactions(activeHousehold?.id, {
    page,
    ...toTransactionListFilters(filters),
  });

  function handleFiltersChange(nextFilters: TransactionFiltersValue) {
    setFilters(nextFilters);
    setPage(1);
  }

  if (householdsQuery.isPending || (activeHousehold !== undefined && categoriesQuery.isPending)) {
    return <TransactionsSkeleton />;
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

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <NewTransactionPanel
        householdId={activeHousehold.id}
        categories={categories}
        isOpen={isFormOpen}
        onOpen={() => {
          setIsFormOpen(true);
          setSuccessMessage(null);
        }}
        onClose={() => setIsFormOpen(false)}
        onCreated={() => {
          setIsFormOpen(false);
          setSuccessMessage('Lançamento criado com sucesso.');
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

      <div className="rounded-2xl border border-line/15 bg-surface p-6">
        <TransactionFilters
          value={filters}
          categories={categories}
          onChange={handleFiltersChange}
        />
      </div>

      {transactionsQuery.isPending ? <TransactionsSkeleton /> : null}

      {transactionsQuery.isError
        ? (() => {
            const { title, description } = resolveTransactionsErrorMessage(transactionsQuery.error);

            return (
              <ErrorNotice
                title={title}
                description={description}
                onRetry={() => transactionsQuery.refetch()}
              />
            );
          })()
        : null}

      {transactionsQuery.data ? (
        <TransactionsResults
          result={transactionsQuery.data}
          categories={categories}
          filters={filters}
          page={page}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}

export function TransactionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Lançamentos</h1>
        <p className="mt-1 text-ink-muted">Veja e acompanhe receitas e despesas da sua casa.</p>
      </div>

      <TransactionsSection />
    </div>
  );
}
