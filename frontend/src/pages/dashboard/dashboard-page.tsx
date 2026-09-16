import { useAuth } from '../../auth/auth-context';
import { CategorySummary } from '../../components/category-summary/category-summary';
import { FinancialSummary } from '../../components/financial-summary/financial-summary';
import { UpcomingPayments } from '../../components/upcoming-payments/upcoming-payments';

export function DashboardPage() {
  const auth = useAuth();
  const firstName = auth.user?.name.split(' ')[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Visão geral</h1>
        <p className="mt-1 text-ink-muted">
          {firstName ? `Olá, ${firstName}. ` : ''}
          Acompanhe aqui o resumo financeiro da sua família.
        </p>
      </div>

      <FinancialSummary />

      <UpcomingPayments />

      <CategorySummary />
    </div>
  );
}
