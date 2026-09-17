import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { BankConnectionEntity } from './bank-connection.entity.js';
import { CategoryEntity } from './category.entity.js';
import { HouseholdMemberEntity } from './household-member.entity.js';
import { TransactionEntity } from './transaction.entity.js';
import { UserEntity } from './user.entity.js';

@Entity('households')
export class HouseholdEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'currency_code', type: 'char', length: 3, default: 'BRL' })
  currencyCode!: string;

  @ManyToOne(() => UserEntity, (user) => user.createdHouseholds, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => HouseholdMemberEntity, (member) => member.household)
  members!: HouseholdMemberEntity[];

  @OneToMany(() => CategoryEntity, (category) => category.household)
  categories!: CategoryEntity[];

  @OneToMany(() => TransactionEntity, (transaction) => transaction.household)
  transactions!: TransactionEntity[];

  @OneToMany(() => BankConnectionEntity, (connection) => connection.household)
  bankConnections!: BankConnectionEntity[];
}
