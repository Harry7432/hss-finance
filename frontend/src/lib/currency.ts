const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatCurrencyBRL(amount: string): string {
  const value = Number(amount);

  return brlFormatter.format(Number.isFinite(value) ? value : 0);
}
