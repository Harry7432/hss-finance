import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest } from '../lib/http';

const balanceSchema = z.object({ balance: z.number() });

export type AsaasBalance = z.infer<typeof balanceSchema>;

export async function getAsaasBalance(householdId: string): Promise<AsaasBalance> {
  const result = await apiRequest<unknown>(`/households/${householdId}/integrations/asaas/balance`);
  const parsedResult = balanceSchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

const financialTransactionSchema = z.object({
  id: z.string(),
  value: z.number(),
  type: z.string(),
  date: z.string(),
  balance: z.number().nullable(),
  description: z.string().nullable(),
});

export type AsaasFinancialTransaction = z.infer<typeof financialTransactionSchema>;

const financialTransactionPageSchema = z.object({
  transactions: z.array(financialTransactionSchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
  offset: z.number(),
  limit: z.number(),
});

export type AsaasFinancialTransactionPage = z.infer<typeof financialTransactionPageSchema>;

const ASAAS_STATEMENT_LIMIT = 20;

export async function listAsaasFinancialTransactions(
  householdId: string,
): Promise<AsaasFinancialTransactionPage> {
  const query = new URLSearchParams({ limit: String(ASAAS_STATEMENT_LIMIT) });
  const result = await apiRequest<unknown>(
    `/households/${householdId}/integrations/asaas/financial-transactions?${query.toString()}`,
  );
  const parsedResult = financialTransactionPageSchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

const billSimulationSchema = z.object({
  value: z.number(),
  dueDate: z.string(),
  originalValue: z.number().nullable(),
  isOverdue: z.boolean().nullable(),
  allowChangeValue: z.boolean().nullable(),
  minValue: z.number().nullable(),
  maxValue: z.number().nullable(),
  beneficiaryName: z.string().nullable(),
  companyName: z.string().nullable(),
  fee: z.number().nullable(),
  minimumScheduleDate: z.string().nullable(),
});

const simulateBillPaymentResultSchema = z.object({
  transaction: z.object({
    id: z.uuid(),
    amount: z.string(),
    status: z.enum(['pending', 'paid']),
  }),
  simulation: billSimulationSchema,
  amountMatchesTransaction: z.boolean(),
});

export type SimulateBillPaymentResult = z.infer<typeof simulateBillPaymentResultSchema>;

export async function simulateBillPayment(
  householdId: string,
  transactionId: string,
  identificationField: string,
): Promise<SimulateBillPaymentResult> {
  const result = await apiRequest<unknown>(
    `/households/${householdId}/transactions/${transactionId}/payment/bill/simulate`,
    { method: 'POST', body: { identificationField } },
  );
  const parsedResult = simulateBillPaymentResultSchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

const payBillResultSchema = z.object({
  paymentAttempt: z.object({
    id: z.uuid(),
    status: z.enum(['requested', 'processing', 'confirmed', 'failed', 'cancelled', 'uncertain']),
    kind: z.enum(['bill', 'pix_transfer']),
  }),
  provider: z.object({ status: z.string() }),
});

export type PayBillResult = z.infer<typeof payBillResultSchema>;

export async function payBill(
  householdId: string,
  transactionId: string,
  identificationField: string,
): Promise<PayBillResult> {
  const result = await apiRequest<unknown>(
    `/households/${householdId}/transactions/${transactionId}/payment/bill`,
    { method: 'POST', body: { identificationField } },
  );
  const parsedResult = payBillResultSchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

const paymentAttemptStatusSchema = z.enum([
  'requested',
  'processing',
  'confirmed',
  'failed',
  'cancelled',
  'uncertain',
]);

export type PaymentAttemptStatus = z.infer<typeof paymentAttemptStatusSchema>;

const paymentAttemptSchema = z.object({
  id: z.uuid(),
  status: paymentAttemptStatusSchema,
  kind: z.enum(['bill', 'pix_transfer']),
  createdAt: z.string(),
  updatedAt: z.string(),
  confirmedAt: z.string().nullable(),
});

export type PaymentAttempt = z.infer<typeof paymentAttemptSchema>;

export async function getPaymentAttempt(
  householdId: string,
  transactionId: string,
): Promise<PaymentAttempt | null> {
  const result = await apiRequest<unknown>(
    `/households/${householdId}/transactions/${transactionId}/payment/bill/attempt`,
  );

  if (result === null) {
    return null;
  }

  const parsedResult = paymentAttemptSchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}
