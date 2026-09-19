import { AsaasBalanceCard } from '../../components/asaas/asaas-balance-card';
import { AsaasConnectionCard } from '../../components/asaas/asaas-connection-card';
import { AsaasStatementCard } from '../../components/asaas/asaas-statement-card';
import { useActiveHousehold } from '../../households/use-active-household';
import { ErrorNotice } from '../../components/error-notice';

export function AsaasPage() {
  const { householdsQuery, activeHousehold } = useActiveHousehold();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Conta Asaas</h1>
        <p className="mt-1 text-ink-muted">
          Acompanhe sua integração com o Asaas e pague boletos com segurança.
        </p>
      </div>

      <AsaasConnectionCard />

      {householdsQuery.isError ? (
        <ErrorNotice
          title="Não foi possível carregar suas famílias agora."
          description="Tente novamente em instantes."
          onRetry={() => householdsQuery.refetch()}
        />
      ) : null}

      {!householdsQuery.isPending && !activeHousehold ? (
        <div className="rounded-2xl border border-line/15 bg-surface p-6 text-center">
          <p className="text-ink-muted">
            Você ainda não faz parte de nenhuma família no HSS Finance.
          </p>
        </div>
      ) : null}

      {activeHousehold ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <AsaasBalanceCard householdId={activeHousehold.id} />
          <div className="lg:col-span-2">
            <AsaasStatementCard householdId={activeHousehold.id} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
