import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { HouseholdEntity } from './household.entity.js';
import { UserEntity } from './user.entity.js';

@Entity('household_members')
@Check("\"role\" IN ('owner', 'member')")
@Unique('uq_household_members_household_user', ['household', 'user'])
export class HouseholdMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => HouseholdEntity, (household) => household.members, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'household_id' })
  household!: HouseholdEntity;

  @ManyToOne(() => UserEntity, (user) => user.memberships, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'text', default: 'member' })
  role!: 'owner' | 'member';

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;
}
