export interface NavItem {
  label: string;
  to?: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Lançamentos', to: '/app/transactions' },
  { label: 'Categorias' },
  { label: 'Família' },
];
