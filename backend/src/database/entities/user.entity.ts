import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { BankConnectionEntity } from './bank-connection.entity.js';
import { HouseholdEntity } from './household.entity.js';
import { HouseholdMemberEntity } from './household-member.entity.js';
import { TransactionEntity } from './transaction.entity.js';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ type: 'text' })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => HouseholdMemberEntity, (member) => member.user)
  memberships!: HouseholdMemberEntity[];

  @OneToMany(() => HouseholdEntity, (household) => household.createdBy)
  createdHouseholds!: HouseholdEntity[];

  @OneToMany(() => TransactionEntity, (transaction) => transaction.createdBy)
  createdTransactions!: TransactionEntity[];

  @OneToMany(() => BankConnectionEntity, (connection) => connection.createdBy)
  createdBankConnections!: BankConnectionEntity[];
}
