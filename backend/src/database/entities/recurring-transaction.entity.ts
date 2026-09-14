import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CategoryEntity } from './category.entity.js';
import { HouseholdEntity } from './household.entity.js';
import { TransactionEntity } from './transaction.entity.js';
import { UserEntity } from './user.entity.js';

@Entity('recurring_transactions')
@Check("\"type\" IN ('income', 'expense')")
@Check('"amount" > 0')
@Check(
  '"expense_nature" IS NULL OR ("type" = \'expense\' AND "expense_nature" IN (\'fixed\', \'variable\'))',
)
@Check('"day_of_month" BETWEEN 1 AND 31')
@Check('"frequency" IN (\'monthly\')')
@Check('"description" IS NULL OR char_length("description") <= 255')
export class RecurringTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => HouseholdEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'household_id' })
  household!: HouseholdEntity;

  @ManyToOne(() => CategoryEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category!: CategoryEntity | null;

  @ManyToOne(() => UserEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;

  @Column({ type: 'text' })
  type!: 'income' | 'expense';

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: 'expense_nature', type: 'text', nullable: true })
  expenseNature!: 'fixed' | 'variable' | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'day_of_month', type: 'smallint' })
  dayOfMonth!: number;

  @Column({ type: 'text', default: 'monthly' })
  frequency!: 'monthly';

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.recurringTransaction)
  occurrences!: TransactionEntity[];
}
