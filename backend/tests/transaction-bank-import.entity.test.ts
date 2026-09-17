import { randomUUID } from 'node:crypto';

import type { QueryRunner } from 'typeorm';

import { appDataSource } from '../src/database/data-source.js';
import { BankAccountEntity } from '../src/database/entities/bank-account.entity.js';
import { BankConnectionEntity } from '../src/database/entities/bank-connection.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { RecurringTransactionEntity } from '../src/database/entities/recurring-transaction.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';

describe('TransactionEntity bank import evolution', () => {
  let queryRunner: QueryRunner;
  let user: UserEntity;
  let household: HouseholdEntity;
  let bankAccount: BankAccountEntity;

  beforeAll(async () => {
    await appDataSource.initialize();
  });

  afterAll(async () => {
    await appDataSource.destroy();
  });

  beforeEach(async () => {
    queryRunner = appDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    user = await queryRunner.manager.save(
      queryRunner.manager.create(UserEntity, {
        email: `transaction-bank-import-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Transaction Bank Import Test User',
      }),
    );

    household = await queryRunner.manager.save(
      queryRunner.manager.create(HouseholdEntity, {
        name: 'Transaction Bank Import Test Household',
        currencyCode: 'BRL',
        createdBy: user,
      }),
    );

    const connection = await queryRunner.manager.save(
      queryRunner.manager.create(BankConnectionEntity, {
        household,
        createdBy: user,
        provider: 'pluggy',
        providerConnectionId: `item-${randomUUID()}`,
        institutionId: 'inst-1',
        institutionName: 'Banco Teste',
        status: 'connected',
      }),
    );

    bankAccount = await queryRunner.manager.save(
      queryRunner.manager.create(BankAccountEntity, {
        bankConnection: connection,
        providerAccountId: 'acc-1',
        type: 'checking',
        name: 'Conta Teste',
        currencyCode: 'BRL',
      }),
    );
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  function baseTransaction(overrides: Partial<TransactionEntity> = {}) {
    return queryRunner.manager.create(TransactionEntity, {
      household,
      createdBy: user,
      category: null,
      type: 'expense',
      amount: '10.00',
      transactionDate: '2026-01-01',
      dueDate: null,
      paidAt: null,
      status: 'pending',
      expenseNature: null,
      source: 'manual',
      externalId: null,
      bankAccount: null,
      description: null,
      originalDescription: null,
      recurringTransaction: null,
      recurringPeriod: null,
      ...overrides,
    });
  }

  it('keeps manual transactions valid without a bank account', async () => {
    const transaction = await queryRunner.manager.save(baseTransaction({ source: 'manual' }));

    expect(transaction.source).toBe('manual');
    expect(transaction.bankAccount).toBeNull();
  });

  it('keeps recurring transactions valid without a bank account', async () => {
    const recurringTransaction = await queryRunner.manager.save(
      queryRunner.manager.create(RecurringTransactionEntity, {
        household,
        createdBy: user,
        category: null,
        type: 'expense',
        amount: '10.00',
        expenseNature: null,
        description: null,
        dayOfMonth: 5,
        frequency: 'monthly',
        isActive: true,
        startDate: '2026-01-01',
      }),
    );

    const transaction = await queryRunner.manager.save(
      baseTransaction({
        source: 'recurring',
        recurringTransaction,
        recurringPeriod: '2026-01-01',
      }),
    );

    expect(transaction.source).toBe('recurring');
    expect(transaction.bankAccount).toBeNull();
  });

  it('rejects a bank_import transaction without a bank account', async () => {
    await expect(
      queryRunner.manager.save(baseTransaction({ source: 'bank_import', bankAccount: null })),
    ).rejects.toThrow();
  });

  it('accepts a bank_import transaction with a bank account and externalId', async () => {
    const transaction = await queryRunner.manager.save(
      baseTransaction({
        source: 'bank_import',
        bankAccount,
        externalId: 'ext-1',
        originalDescription: 'PIX RECEBIDO JOAO',
      }),
    );

    expect(transaction.source).toBe('bank_import');
    expect(transaction.externalId).toBe('ext-1');
    expect(transaction.originalDescription).toBe('PIX RECEBIDO JOAO');
  });

  it('rejects a duplicate bankAccount + externalId pair', async () => {
    await queryRunner.manager.save(
      baseTransaction({ source: 'bank_import', bankAccount, externalId: 'duplicate-ext' }),
    );

    await expect(
      queryRunner.manager.save(
        baseTransaction({ source: 'bank_import', bankAccount, externalId: 'duplicate-ext' }),
      ),
    ).rejects.toThrow();
  });

  it('allows the same externalId across different bank accounts', async () => {
    const otherConnection = await queryRunner.manager.save(
      queryRunner.manager.create(BankConnectionEntity, {
        household,
        createdBy: user,
        provider: 'pluggy',
        providerConnectionId: `item-${randomUUID()}`,
        institutionId: 'inst-2',
        institutionName: 'Outro Banco',
        status: 'connected',
      }),
    );
    const otherBankAccount = await queryRunner.manager.save(
      queryRunner.manager.create(BankAccountEntity, {
        bankConnection: otherConnection,
        providerAccountId: 'acc-2',
        type: 'checking',
        name: 'Outra Conta',
        currencyCode: 'BRL',
      }),
    );

    await queryRunner.manager.save(
      baseTransaction({ source: 'bank_import', bankAccount, externalId: 'shared-ext' }),
    );

    const secondTransaction = await queryRunner.manager.save(
      baseTransaction({
        source: 'bank_import',
        bankAccount: otherBankAccount,
        externalId: 'shared-ext',
      }),
    );

    expect(secondTransaction.id).toBeDefined();
  });

  it('allows multiple bank_import transactions on the same account with a null externalId', async () => {
    await queryRunner.manager.save(
      baseTransaction({ source: 'bank_import', bankAccount, externalId: null }),
    );

    const secondTransaction = await queryRunner.manager.save(
      baseTransaction({ source: 'bank_import', bankAccount, externalId: null }),
    );

    expect(secondTransaction.id).toBeDefined();
    expect(secondTransaction.externalId).toBeNull();
  });

  it('rejects a bank_import transaction attached to a source other than bank_import', async () => {
    await expect(
      queryRunner.manager.save(
        baseTransaction({ source: 'manual', bankAccount, externalId: 'ext-manual-conflict' }),
      ),
    ).rejects.toThrow();
  });
});
