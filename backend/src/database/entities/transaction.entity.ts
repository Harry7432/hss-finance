import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CategoryEntity } from './category.entity.js';
import { HouseholdEntity } from './household.entity.js';
import { UserEntity } from './user.entity.js';

@Entity('transactions')
@Check("\"type\" IN ('income', 'expense')")
@Check('"amount" > 0')
@Check("\"status\" IN ('pending', 'paid')")
@Check("\"source\" IN ('manual', 'bank_import')")
@Check('("status" = \'paid\') = ("paid_at" IS NOT NULL)')
@Check('"description" IS NULL OR char_length("description") <= 255')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => HouseholdEntity, (household) => household.transactions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'household_id' })
  household!: HouseholdEntity;

  @ManyToOne(() => CategoryEntity, (category) => category.transactions, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category!: CategoryEntity | null;

  @ManyToOne(() => UserEntity, (user) => user.createdTransactions, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;

  @Column({ type: 'text' })
  type!: 'income' | 'expense';

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate!: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'text', default: 'pending' })
  status!: 'pending' | 'paid';

  @Column({ type: 'text', default: 'manual' })
  source!: 'manual' | 'bank_import';

  @Column({ name: 'external_id', type: 'text', nullable: true })
  externalId!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
