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
import { RecurringTransactionEntity } from './recurring-transaction.entity.js';
import { UserEntity } from './user.entity.js';

@Entity('transactions')
@Check("\"type\" IN ('income', 'expense')")
@Check('"amount" > 0')
@Check("\"status\" IN ('pending', 'paid')")
@Check("\"source\" IN ('manual', 'bank_import', 'recurring')")
@Check('("status" = \'paid\') = ("paid_at" IS NOT NULL)')
@Check('"description" IS NULL OR char_length("description") <= 255')
@Check(
  '"expense_nature" IS NULL OR ("type" = \'expense\' AND "expense_nature" IN (\'fixed\', \'variable\'))',
)
@Check('("recurring_transaction_id" IS NULL) = ("recurring_period" IS NULL)')
@Check('("source" = \'recurring\') = ("recurring_transaction_id" IS NOT NULL)')
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

  @Column({ name: 'expense_nature', type: 'text', nullable: true })
  expenseNature!: 'fixed' | 'variable' | null;

  @Column({ type: 'text', default: 'manual' })
  source!: 'manual' | 'bank_import' | 'recurring';

  @Column({ name: 'external_id', type: 'text', nullable: true })
  externalId!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ManyToOne(
    () => RecurringTransactionEntity,
    (recurringTransaction) => recurringTransaction.occurrences,
    {
      nullable: true,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'recurring_transaction_id' })
  recurringTransaction!: RecurringTransactionEntity | null;

  @Column({ name: 'recurring_period', type: 'date', nullable: true })
  recurringPeriod!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
