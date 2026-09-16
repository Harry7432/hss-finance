export interface NavItem {
  label: string;
  to?: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Lançamentos' },
  { label: 'Categorias' },
  { label: 'Família' },
];
