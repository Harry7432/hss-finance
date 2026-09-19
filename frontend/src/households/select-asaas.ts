import type { PaymentAttemptStatus } from './asaas-api';

export const PAYMENT_ATTEMPT_STATUS_LABEL: Record<PaymentAttemptStatus, string> = {
  requested: 'Processamento iniciado',
  processing: 'Processamento iniciado',
  confirmed: 'Pagamento confirmado',
  failed: 'Pagamento não concluído',
  cancelled: 'Pagamento cancelado',
  uncertain: 'Confirmação pendente — não tente novamente',
};

export type PaymentAttemptStatusTone = 'pending' | 'income' | 'expense';

export const PAYMENT_ATTEMPT_STATUS_TONE: Record<PaymentAttemptStatus, PaymentAttemptStatusTone> = {
  requested: 'pending',
  processing: 'pending',
  confirmed: 'income',
  failed: 'expense',
  cancelled: 'expense',
  uncertain: 'pending',
};

const TERMINAL_PAYMENT_ATTEMPT_STATUSES: ReadonlySet<PaymentAttemptStatus> = new Set([
  'confirmed',
  'failed',
  'cancelled',
  'uncertain',
]);

export function isTerminalPaymentAttemptStatus(status: PaymentAttemptStatus): boolean {
  return TERMINAL_PAYMENT_ATTEMPT_STATUSES.has(status);
}

// A retry after 'uncertain' could pay the same bill twice — the backend does not know whether
// Asaas already processed it, so the frontend must never offer an automatic or one-click retry
// for that status. Every other terminal status is safe to let the user attempt again.
export function canRetryAfterPaymentAttempt(status: PaymentAttemptStatus): boolean {
  return status === 'failed' || status === 'cancelled';
}
