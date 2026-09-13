import type { DataSource } from 'typeorm';

import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import { HouseholdEntity } from '../database/entities/household.entity.js';
import { UserEntity } from '../database/entities/user.entity.js';

export interface CreateHouseholdData {
  name: string;
  creatorId: string;
}

export interface CreatedHousehold {
  id: string;
  name: string;
  currencyCode: string;
  role: 'owner';
  createdAt: Date;
}

export interface ListedHousehold {
  id: string;
  name: string;
  currencyCode: string;
  role: 'owner' | 'member';
  createdAt: Date;
}

export interface HouseholdRepository {
  createWithOwner(data: CreateHouseholdData): Promise<CreatedHousehold | null>;
  listForMember(userId: string): Promise<ListedHousehold[]>;
}

export class TypeOrmHouseholdRepository implements HouseholdRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createWithOwner(data: CreateHouseholdData): Promise<CreatedHousehold | null> {
    return this.dataSource.transaction(async (manager) => {
      const creator = await manager.findOneBy(UserEntity, { id: data.creatorId });

      if (!creator) {
        return null;
      }

      const household = manager.create(HouseholdEntity, {
        name: data.name,
        currencyCode: 'BRL',
        createdBy: creator,
      });
      const savedHousehold = await manager.save(household);
      const membership = manager.create(HouseholdMemberEntity, {
        household: savedHousehold,
        user: creator,
        role: 'owner',
      });
      const savedMembership = await manager.save(membership);

      if (savedMembership.role !== 'owner') {
        throw new Error('The household owner membership could not be created.');
      }

      return {
        id: savedHousehold.id,
        name: savedHousehold.name,
        currencyCode: savedHousehold.currencyCode,
        role: savedMembership.role,
        createdAt: savedHousehold.createdAt,
      };
    });
  }

  async listForMember(userId: string): Promise<ListedHousehold[]> {
    const memberships = await this.dataSource
      .getRepository(HouseholdMemberEntity)
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.household', 'household')
      .where('member.user_id = :userId', { userId })
      .orderBy('household.created_at', 'DESC')
      .addOrderBy('household.id', 'DESC')
      .getMany();

    return memberships.map((membership) => ({
      id: membership.household.id,
      name: membership.household.name,
      currencyCode: membership.household.currencyCode,
      role: membership.role,
      createdAt: membership.household.createdAt,
    }));
  }
}
