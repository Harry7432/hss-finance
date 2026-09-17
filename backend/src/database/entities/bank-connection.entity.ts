import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { BankAccountEntity } from './bank-account.entity.js';
import { HouseholdEntity } from './household.entity.js';
import { UserEntity } from './user.entity.js';

export type BankConnectionStatus = 'pending' | 'connected' | 'error' | 'expired' | 'disconnected';

@Entity('bank_connections')
@Check("\"status\" IN ('pending', 'connected', 'error', 'expired', 'disconnected')")
@Unique('uq_bank_connections_provider_connection', ['provider', 'providerConnectionId'])
export class BankConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => HouseholdEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'household_id' })
  household!: HouseholdEntity;

  @ManyToOne(() => UserEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;

  @Column({ type: 'text' })
  provider!: string;

  @Column({ name: 'provider_connection_id', type: 'text' })
  providerConnectionId!: string;

  @Column({ name: 'institution_id', type: 'text' })
  institutionId!: string;

  @Column({ name: 'institution_name', type: 'text' })
  institutionName!: string;

  @Column({ type: 'text' })
  status!: BankConnectionStatus;

  @Column({ name: 'consent_expires_at', type: 'timestamptz', nullable: true })
  consentExpiresAt!: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ name: 'last_sync_error', type: 'text', nullable: true })
  lastSyncError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => BankAccountEntity, (account) => account.bankConnection)
  accounts!: BankAccountEntity[];
}
