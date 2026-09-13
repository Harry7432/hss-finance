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

import { HouseholdEntity } from './household.entity.js';
import { TransactionEntity } from './transaction.entity.js';

@Entity('categories')
@Check("\"type\" IN ('income', 'expense')")
@Check('"color" IS NULL OR "color" ~ \'^#[0-9A-Fa-f]{6}$\'')
@Unique('uq_categories_household_type_name', ['household', 'type', 'name'])
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => HouseholdEntity, (household) => household.categories, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'household_id' })
  household!: HouseholdEntity;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  type!: 'income' | 'expense';

  @Column({ name: 'color', type: 'char', length: 7, nullable: true })
  color!: string | null;

  @Column({ type: 'text', nullable: true })
  icon!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.category)
  transactions!: TransactionEntity[];
}
