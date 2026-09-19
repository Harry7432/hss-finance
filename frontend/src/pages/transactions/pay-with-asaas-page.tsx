import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import type { SimulateBillPaymentResult } from '../../households/asaas-api';
import {
  PAYMENT_ATTEMPT_STATUS_LABEL,
  PAYMENT_ATTEMPT_STATUS_TONE,
  canRetryAfterPaymentAttempt,
} from '../../households/select-asaas';
import { useActiveHousehold } from '../../households/use-active-household';
import { usePayBill } from '../../households/use-pay-bill';
import { usePaymentAttempt } from '../../households/use-payment-attempt';
import { useSimulateBillPayment } from '../../households/use-simulate-bill-payment';
import { useTransaction } from '../../households/use-transaction';
import { ApiError } from '../../lib/api-error';
import { cn } from '../../lib/cn';
import { formatCurrencyBRL } from '../../lib/currency';
import { formatDateOnlyPtBR } from '../../lib/date-only';
import { ErrorNotice } from '../../components/error-notice';
import { TextField } from '../../components/form/text-field';

function resolveTransactionErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 404) {
    return {
      title: 'Transação não encontrada.',
      description: 'Ela pode ter sido removida ou pertencer a outra família.',
    };
  }

  if (error instanceof ApiError && error.status === 403) {
    return {
      title: 'Não foi possível carregar esta transação.',
      description: 'Verifique se você ainda faz parte desta família.',
    };
  }

  return {
    title: 'Não foi possível carregar a transação agora.',
    description: 'Tente novamente em instantes.',
  };
}

function resolveSimulateErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_BILL') {
      return 'O boleto informado não pôde ser validado pelo Asaas.';
    }

    if (error.code === 'TRANSACTION_ALREADY_PAID') {
      return 'Esta transação já foi paga.';
    }

    if (error.status === 400) {
      return 'Informe uma linha digitável válida.';
    }

    if (error.status === 503 && error.code === 'PROVIDER_NOT_CONFIGURED') {
      return 'A integração com o Asaas não está configurada.';
    }
  }

  return 'Não foi possível simular o pagamento agora. Tente novamente.';
}

function resolvePayErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PAYMENT_ATTEMPT_ALREADY_ACTIVE') {
      return 'Já existe um pagamento em andamento para esta transação.';
    }

    if (error.code === 'TRANSACTION_ALREADY_PAID') {
      return 'Esta transação já foi paga.';
    }

    if (error.code === 'TRANSACTION_AMOUNT_CHANGED') {
      return 'O valor da transação mudou desde a simulação. Simule novamente.';
    }

    if (error.code === 'INVALID_BILL') {
      return 'O boleto informado não pôde ser validado pelo Asaas.';
    }

    if (error.code === 'PROVIDER_RESPONSE_UNCERTAIN') {
      return 'Não foi possível confirmar o resultado do pagamento junto ao Asaas. Não tente novamente — isso será verificado manualmente.';
    }

    if (error.code === 'PROVIDER_NOT_CONFIGURED') {
      return 'A integração com o Asaas não está configurada.';
    }
  }

  return 'Não foi possível enviar o pagamento agora. Tente novamente.';
}

function TransactionSummaryCard({
  description,
  amount,
  dueDate,
  status,
}: {
  description: string | null;
  amount: string;
  dueDate: string | null;
  status: 'pending' | 'paid';
}) {
  return (
    <section className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">{description ?? 'Sem descrição'}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Valor</dt>
          <dd className="font-semibold tabular-nums text-ink">{formatCurrencyBRL(amount)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Vencimento</dt>
          <dd className="font-medium text-ink">{dueDate ? formatDateOnlyPtBR(dueDate) : '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Status</dt>
          <dd className="font-medium text-ink">{status === 'paid' ? 'Pago' : 'Pendente'}</dd>
        </div>
      </dl>
    </section>
  );
}

function SimulationResultCard({
  simulation,
  onConfirm,
  isConfirmPending,
}: {
  simulation: SimulateBillPaymentResult;
  onConfirm: () => void;
  isConfirmPending: boolean;
}) {
  const { transaction, simulation: bill, amountMatchesTransaction } = simulation;

  return (
    <section className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">Confirmar pagamento</h2>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Transação</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {formatCurrencyBRL(transaction.amount)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Boleto</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {formatCurrencyBRL(String(bill.value))}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Vencimento</dt>
          <dd className="font-medium text-ink">{formatDateOnlyPtBR(bill.dueDate)}</dd>
        </div>
        {bill.fee !== null ? (
          <div>
            <dt className="text-ink-muted">Taxa</dt>
            <dd className="font-medium text-ink">{formatCurrencyBRL(String(bill.fee))}</dd>
          </div>
        ) : null}
        {bill.beneficiaryName !== null ? (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-ink-muted">Beneficiário</dt>
            <dd className="font-medium text-ink">{bill.beneficiaryName}</dd>
          </div>
        ) : null}
      </dl>

      {!amountMatchesTransaction ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-expense/10 p-3 text-sm font-medium text-expense"
        >
          O valor retornado pelo Asaas é diferente do valor da transação.
        </p>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          disabled={isConfirmPending}
          className="mt-4 min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConfirmPending ? 'Confirmando...' : 'Confirmar pagamento'}
        </button>
      )}
    </section>
  );
}

function BillPaymentForm({
  householdId,
  transactionId,
  onPaid,
}: {
  householdId: string;
  transactionId: string;
  onPaid: () => void;
}) {
  const [identificationField, setIdentificationField] = useState('');
  const simulateMutation = useSimulateBillPayment(householdId, transactionId);
  const payMutation = usePayBill(householdId, transactionId);

  useEffect(() => {
    if (payMutation.isSuccess) {
      onPaid();
    }
    // onPaid is a fresh closure from the parent on every render; only isSuccess should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payMutation.isSuccess]);

  function handleSimulate() {
    if (simulateMutation.isPending || identificationField.trim() === '') {
      return;
    }

    simulateMutation.mutate(identificationField.trim());
  }

  function handleConfirm() {
    if (payMutation.isPending) {
      return;
    }

    payMutation.mutate(identificationField.trim());
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-line/15 bg-surface p-6">
        <h2 className="text-lg font-semibold text-ink">Pagar boleto</h2>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextField
              label="Linha digitável"
              value={identificationField}
              onChange={(event) => setIdentificationField(event.target.value)}
              placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
              autoComplete="off"
              disabled={simulateMutation.isPending}
            />
          </div>
          <button
            type="button"
            onClick={handleSimulate}
            disabled={simulateMutation.isPending || identificationField.trim() === ''}
            className="min-h-11 shrink-0 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
          >
            {simulateMutation.isPending ? 'Simulando...' : 'Simular pagamento'}
          </button>
        </div>

        {simulateMutation.isError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-expense">
            {resolveSimulateErrorMessage(simulateMutation.error)}
          </p>
        ) : null}
      </section>

      {payMutation.isError ? (
        <p role="alert" className="text-sm font-medium text-expense">
          {resolvePayErrorMessage(payMutation.error)}
        </p>
      ) : null}

      {simulateMutation.data ? (
        <SimulationResultCard
          simulation={simulateMutation.data}
          onConfirm={handleConfirm}
          isConfirmPending={payMutation.isPending}
        />
      ) : null}
    </div>
  );
}

function PaymentAttemptResultCard({
  status,
  onRetry,
}: {
  status: keyof typeof PAYMENT_ATTEMPT_STATUS_LABEL;
  onRetry: () => void;
}) {
  const tone = PAYMENT_ATTEMPT_STATUS_TONE[status];

  return (
    <section className="rounded-2xl border border-line/15 bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">Pagamento enviado para processamento</h2>
      <p
        role="status"
        className={cn(
          'mt-2 text-lg font-semibold',
          tone === 'income' && 'text-income',
          tone === 'expense' && 'text-expense',
          tone === 'pending' && 'text-pending',
        )}
      >
        {PAYMENT_ATTEMPT_STATUS_LABEL[status]}
      </p>

      {canRetryAfterPaymentAttempt(status) ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 min-h-11 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt"
        >
          Tentar novamente
        </button>
      ) : null}
    </section>
  );
}

export function PayWithAsaasPage() {
  const params = useParams<{ transactionId: string }>();
  const transactionId = params.transactionId ?? '';
  const { householdsQuery, activeHousehold } = useActiveHousehold();
  const [forceShowForm, setForceShowForm] = useState(false);

  const transactionQuery = useTransaction(activeHousehold?.id, transactionId);
  const paymentAttemptQuery = usePaymentAttempt(activeHousehold?.id, transactionId, {
    poll: true,
  });

  const isLoading =
    householdsQuery.isPending ||
    (activeHousehold !== undefined &&
      (transactionQuery.isPending || paymentAttemptQuery.isPending));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/app/transactions" className="text-sm font-medium text-brand-strong">
          ← Voltar para lançamentos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-ink">Pagar boleto</h1>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-line/15 bg-surface p-6">
          <p role="status" className="sr-only">
            Carregando...
          </p>
          <div aria-hidden="true" className="h-24 animate-pulse rounded-xl bg-page" />
        </div>
      ) : null}

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

      {activeHousehold && transactionQuery.isError
        ? (() => {
            const { title, description } = resolveTransactionErrorMessage(transactionQuery.error);

            return (
              <ErrorNotice
                title={title}
                description={description}
                onRetry={() => transactionQuery.refetch()}
              />
            );
          })()
        : null}

      {activeHousehold && transactionQuery.data ? (
        <>
          <TransactionSummaryCard
            description={transactionQuery.data.description}
            amount={transactionQuery.data.amount}
            dueDate={transactionQuery.data.dueDate}
            status={transactionQuery.data.status}
          />

          {paymentAttemptQuery.data && !forceShowForm ? (
            <PaymentAttemptResultCard
              status={paymentAttemptQuery.data.status}
              onRetry={() => setForceShowForm(true)}
            />
          ) : paymentAttemptQuery.data === null || forceShowForm ? (
            transactionQuery.data.status === 'pending' ? (
              <BillPaymentForm
                householdId={activeHousehold.id}
                transactionId={transactionId}
                onPaid={() => setForceShowForm(false)}
              />
            ) : (
              <p className="rounded-2xl border border-line/15 bg-surface p-6 text-sm text-ink-muted">
                Esta transação não está pendente — não é possível iniciar um pagamento.
              </p>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
