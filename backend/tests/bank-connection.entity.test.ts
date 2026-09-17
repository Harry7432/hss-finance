import { randomUUID } from 'node:crypto';

import type { QueryRunner } from 'typeorm';

import { appDataSource } from '../src/database/data-source.js';
import { BankConnectionEntity } from '../src/database/entities/bank-connection.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';

describe('BankConnectionEntity', () => {
  let queryRunner: QueryRunner;
  let user: UserEntity;
  let household: HouseholdEntity;

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
        email: `bank-connection-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Bank Connection Test User',
      }),
    );

    household = await queryRunner.manager.save(
      queryRunner.manager.create(HouseholdEntity, {
        name: 'Bank Connection Test Household',
        currencyCode: 'BRL',
        createdBy: user,
      }),
    );
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  it('creates a bank connection with all required fields', async () => {
    const connection = await queryRunner.manager.save(
      queryRunner.manager.create(BankConnectionEntity, {
        household,
        createdBy: user,
        provider: 'pluggy',
        providerConnectionId: 'item-1',
        institutionId: 'inst-1',
        institutionName: 'Banco Teste',
        status: 'connected',
        consentExpiresAt: null,
        lastSyncedAt: null,
        lastSyncError: null,
      }),
    );

    expect(connection.id).toBeDefined();
    expect(connection.status).toBe('connected');
    expect(connection.createdAt).toBeInstanceOf(Date);
  });

  it('accepts every allowed status value', async () => {
    const allowedStatuses = ['pending', 'connected', 'error', 'expired', 'disconnected'] as const;

    for (const status of allowedStatuses) {
      const connection = await queryRunner.manager.save(
        queryRunner.manager.create(BankConnectionEntity, {
          household,
          createdBy: user,
          provider: 'pluggy',
          providerConnectionId: `item-status-${status}`,
          institutionId: 'inst-1',
          institutionName: 'Banco Teste',
          status,
        }),
      );

      expect(connection.status).toBe(status);
    }
  });

  it('rejects an invalid status', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(BankConnectionEntity, {
          household,
          createdBy: user,
          provider: 'pluggy',
          providerConnectionId: 'item-invalid-status',
          institutionId: 'inst-1',
          institutionName: 'Banco Teste',
          status: 'syncing' as unknown as BankConnectionEntity['status'],
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects a duplicate provider + providerConnectionId pair', async () => {
    await queryRunner.manager.save(
      queryRunner.manager.create(BankConnectionEntity, {
        household,
        createdBy: user,
        provider: 'pluggy',
        providerConnectionId: 'duplicate-item',
        institutionId: 'inst-1',
        institutionName: 'Banco Teste',
        status: 'connected',
      }),
    );

    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(BankConnectionEntity, {
          household,
          createdBy: user,
          provider: 'pluggy',
          providerConnectionId: 'duplicate-item',
          institutionId: 'inst-2',
          institutionName: 'Outro Banco',
          status: 'connected',
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows the same providerConnectionId for different providers', async () => {
    await queryRunner.manager.save(
      queryRunner.manager.create(BankConnectionEntity, {
        household,
        createdBy: user,
        provider: 'pluggy',
        providerConnectionId: 'shared-id',
        institutionId: 'inst-1',
        institutionName: 'Banco Teste',
        status: 'connected',
      }),
    );

    const secondConnection = await queryRunner.manager.save(
      queryRunner.manager.create(BankConnectionEntity, {
        household,
        createdBy: user,
        provider: 'belvo',
        providerConnectionId: 'shared-id',
        institutionId: 'inst-1',
        institutionName: 'Banco Teste',
        status: 'connected',
      }),
    );

    expect(secondConnection.id).toBeDefined();
  });

  it('rejects a connection referencing a non-existent household', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(BankConnectionEntity, {
          household: { id: randomUUID() } as HouseholdEntity,
          createdBy: user,
          provider: 'pluggy',
          providerConnectionId: 'no-household',
          institutionId: 'inst-1',
          institutionName: 'Banco Teste',
          status: 'connected',
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects a connection referencing a non-existent creator', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(BankConnectionEntity, {
          household,
          createdBy: { id: randomUUID() } as UserEntity,
          provider: 'pluggy',
          providerConnectionId: 'no-creator',
          institutionId: 'inst-1',
          institutionName: 'Banco Teste',
          status: 'connected',
        }),
      ),
    ).rejects.toThrow();
  });
});
