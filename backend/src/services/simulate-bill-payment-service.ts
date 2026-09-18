import type {
  AsaasBillSimulation,
  AsaasSimulateBillPaymentInput,
} from '../integrations/asaas/asaas-client.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';

export interface BillSimulationClient {
  simulateBillPayment(input: AsaasSimulateBillPaymentInput): Promise<AsaasBillSimulation>;
}

export interface SimulateBillPaymentInput {
  householdId: string;
  requesterId: string;
  transactionId: string;
  identificationField: string;
}

export interface SimulateBillPaymentResult {
  transaction: {
    id: string;
    amount: string;
    status: 'pending' | 'paid';
  };
  simulation: AsaasBillSimulation;
  amountMatchesTransaction: boolean;
}

function toCents(amount: string): number {
  const [integer = '0', fraction = '00'] = amount.split('.');
  return Number(integer) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

export class SimulateBillPaymentService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly asaasClient: BillSimulationClient,
  ) {}

  async execute(input: SimulateBillPaymentInput): Promise<SimulateBillPaymentResult> {
    const transaction = await this.transactions.findPendingAsOwner({
      householdId: input.householdId,
      requesterId: input.requesterId,
      transactionId: input.transactionId,
    });

    const simulation = await this.asaasClient.simulateBillPayment({
      identificationField: input.identificationField,
    });

    const amountMatchesTransaction =
      toCents(transaction.amount) === Math.round(simulation.value * 100);

    return {
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        status: transaction.status,
      },
      simulation,
      amountMatchesTransaction,
    };
  }
}
