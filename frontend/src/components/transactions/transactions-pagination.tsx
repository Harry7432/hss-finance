interface TransactionsPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function TransactionsPagination({
  page,
  totalPages,
  onPageChange,
}: TransactionsPaginationProps) {
  const isFirstPage = page <= 1;
  const isLastPage = totalPages === 0 || page >= totalPages;

  return (
    <nav
      aria-label="Paginação de lançamentos"
      className="flex items-center justify-between gap-4 border-t border-line/15 pt-4"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={isFirstPage}
        className="min-h-11 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
      >
        Página anterior
      </button>

      <p className="text-sm text-ink-muted">
        Página {totalPages === 0 ? 0 : page} de {totalPages}
      </p>

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={isLastPage}
        className="min-h-11 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
      >
        Próxima página
      </button>
    </nav>
  );
}
