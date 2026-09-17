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

import { BankConnectionEntity } from './bank-connection.entity.js';
import { TransactionEntity } from './transaction.entity.js';

export type BankAccountType = 'checking' | 'savings' | 'credit_card' | 'investment' | 'other';

@Entity('bank_accounts')
@Check("\"type\" IN ('checking', 'savings', 'credit_card', 'investment', 'other')")
@Check('"currency_code" ~ \'^[A-Z]{3}$\'')
@Unique('uq_bank_accounts_connection_provider_account', ['bankConnection', 'providerAccountId'])
export class BankAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => BankConnectionEntity, (connection) => connection.accounts, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bank_connection_id' })
  bankConnection!: BankConnectionEntity;

  @Column({ name: 'provider_account_id', type: 'text' })
  providerAccountId!: string;

  @Column({ type: 'text' })
  type!: BankAccountType;

  @Column({ type: 'text', nullable: true })
  subtype!: string | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  balance!: string | null;

  @Column({ name: 'balance_updated_at', type: 'timestamptz', nullable: true })
  balanceUpdatedAt!: Date | null;

  @Column({ name: 'masked_number', type: 'text', nullable: true })
  maskedNumber!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.bankAccount)
  transactions!: TransactionEntity[];
}
