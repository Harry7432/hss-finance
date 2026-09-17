import { randomUUID } from 'node:crypto';

import type { QueryRunner } from 'typeorm';

import { appDataSource } from '../src/database/data-source.js';
import { BankAccountEntity } from '../src/database/entities/bank-account.entity.js';
import { BankConnectionEntity } from '../src/database/entities/bank-connection.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';

describe('BankAccountEntity', () => {
  let queryRunner: QueryRunner;
  let user: UserEntity;
  let household: HouseholdEntity;
  let connection: BankConnectionEntity;

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
        email: `bank-account-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Bank Account Test User',
      }),
    );

    household = await queryRunner.manager.save(
      queryRunner.manager.create(HouseholdEntity, {
        name: 'Bank Account Test Household',
        currencyCode: 'BRL',
        createdBy: user,
      }),
    );

    connection = await queryRunner.manager.save(
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
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  it('creates a bank account with only the required fields', async () => {
    const account = await queryRunner.manager.save(
      queryRunner.manager.create(BankAccountEntity, {
        bankConnection: connection,
        providerAccountId: 'acc-1',
        type: 'checking',
        name: 'Conta Corrente',
        currencyCode: 'BRL',
      }),
    );

    expect(account.id).toBeDefined();
    expect(account.subtype).toBeNull();
    expect(account.balance).toBeNull();
    expect(account.balanceUpdatedAt).toBeNull();
    expect(account.maskedNumber).toBeNull();
  });

  it('accepts every allowed account type', async () => {
    const allowedTypes = ['checking', 'savings', 'credit_card', 'investment', 'other'] as const;

    for (const type of allowedTypes) {
      const account = await queryRunner.manager.save(
        queryRunner.manager.create(BankAccountEntity, {
          bankConnection: connection,
          providerAccountId: `acc-type-${type}`,
          type,
          name: 'Conta Teste',
          currencyCode: 'BRL',
        }),
      );

      expect(account.type).toBe(type);
    }
  });

  it('rejects an invalid account type', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(BankAccountEntity, {
          bankConnection: connection,
          providerAccountId: 'acc-invalid-type',
          type: 'crypto_wallet' as unknown as BankAccountEntity['type'],
          name: 'Conta Teste',
          currencyCode: 'BRL',
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects an invalid currency code', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(BankAccountEntity, {
          bankConnection: connection,
          providerAccountId: 'acc-invalid-currency',
          type: 'checking',
          name: 'Conta Teste',
          currencyCode: 'brl',
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects a duplicate providerAccountId within the same connection', async () => {
    await queryRunner.manager.save(
      queryRunner.manager.create(BankAccountEntity, {
        bankConnection: connection,
        providerAccountId: 'duplicate-account',
        type: 'checking',
        name: 'Conta Teste',
        currencyCode: 'BRL',
      }),
    );

    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(BankAccountEntity, {
          bankConnection: connection,
          providerAccountId: 'duplicate-account',
          type: 'savings',
          name: 'Outra Conta',
          currencyCode: 'BRL',
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows the same providerAccountId on a different connection', async () => {
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

    await queryRunner.manager.save(
      queryRunner.manager.create(BankAccountEntity, {
        bankConnection: connection,
        providerAccountId: 'shared-account-id',
        type: 'checking',
        name: 'Conta Teste',
        currencyCode: 'BRL',
      }),
    );

    const secondAccount = await queryRunner.manager.save(
      queryRunner.manager.create(BankAccountEntity, {
        bankConnection: otherConnection,
        providerAccountId: 'shared-account-id',
        type: 'checking',
        name: 'Conta Teste 2',
        currencyCode: 'BRL',
      }),
    );

    expect(secondAccount.id).toBeDefined();
  });

  it('rejects an account referencing a non-existent bank connection', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(BankAccountEntity, {
          bankConnection: { id: randomUUID() } as BankConnectionEntity,
          providerAccountId: 'acc-no-connection',
          type: 'checking',
          name: 'Conta Teste',
          currencyCode: 'BRL',
        }),
      ),
    ).rejects.toThrow();
  });

  it('accepts optional fields when provided', async () => {
    const account = await queryRunner.manager.save(
      queryRunner.manager.create(BankAccountEntity, {
        bankConnection: connection,
        providerAccountId: 'acc-full',
        type: 'credit_card',
        subtype: 'platinum',
        name: 'Cartão Teste',
        currencyCode: 'BRL',
        balance: '1234.56',
        balanceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
        maskedNumber: '**** 1234',
      }),
    );

    expect(account.subtype).toBe('platinum');
    expect(account.balance).toBe('1234.56');
    expect(account.maskedNumber).toBe('**** 1234');
  });
});
