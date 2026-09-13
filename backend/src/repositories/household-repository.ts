import type { DataSource } from 'typeorm';

import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import { HouseholdEntity } from '../database/entities/household.entity.js';
import { UserEntity } from '../database/entities/user.entity.js';
import { AlreadyHouseholdMemberError } from '../errors/already-household-member-error.js';
import { ForbiddenError } from '../errors/forbidden-error.js';

const UNIQUE_VIOLATION_CODE = '23505';
const HOUSEHOLD_MEMBER_CONSTRAINT = 'uq_household_members_household_user';

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

export interface ListedHouseholdMember {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: Date;
}

export interface AddedHouseholdMember {
  role: 'member';
  joinedAt: Date;
}

interface HouseholdMemberRow {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: Date | string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHouseholdMemberUniqueViolation(error: unknown): boolean {
  if (!isRecord(error) || !isRecord(error.driverError)) {
    return false;
  }

  return (
    error.driverError.code === UNIQUE_VIOLATION_CODE &&
    error.driverError.constraint === HOUSEHOLD_MEMBER_CONSTRAINT
  );
}

export interface HouseholdRepository {
  createWithOwner(data: CreateHouseholdData): Promise<CreatedHousehold | null>;
  listForMember(userId: string): Promise<ListedHousehold[]>;
  listMembersForMember(
    householdId: string,
    userId: string,
  ): Promise<ListedHouseholdMember[] | null>;
  findMembershipRole(householdId: string, userId: string): Promise<'owner' | 'member' | null>;
  addMemberAsOwner(
    householdId: string,
    requesterId: string,
    userId: string,
  ): Promise<AddedHouseholdMember>;
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

  async listMembersForMember(
    householdId: string,
    userId: string,
  ): Promise<ListedHouseholdMember[] | null> {
    const rows = await this.dataSource
      .getRepository(HouseholdMemberEntity)
      .createQueryBuilder('member')
      .innerJoin('member.user', 'user')
      .innerJoin(
        HouseholdMemberEntity,
        'viewer',
        'viewer.household_id = member.household_id AND viewer.user_id = :userId',
        { userId },
      )
      .select('user.id', 'userId')
      .addSelect('user.name', 'name')
      .addSelect('user.email', 'email')
      .addSelect('member.role', 'role')
      .addSelect('member.joined_at', 'joinedAt')
      .where('member.household_id = :householdId', { householdId })
      .orderBy("CASE WHEN member.role = 'owner' THEN 0 ELSE 1 END", 'ASC')
      .addOrderBy('member.joined_at', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .getRawMany<HouseholdMemberRow>();

    if (rows.length === 0) {
      return null;
    }

    return rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.role,
      joinedAt: row.joinedAt instanceof Date ? row.joinedAt : new Date(row.joinedAt),
    }));
  }

  async findMembershipRole(
    householdId: string,
    userId: string,
  ): Promise<'owner' | 'member' | null> {
    const membership = await this.dataSource.getRepository(HouseholdMemberEntity).findOne({
      select: { role: true },
      where: {
        household: { id: householdId },
        user: { id: userId },
      },
    });

    return membership?.role ?? null;
  }

  async addMemberAsOwner(
    householdId: string,
    requesterId: string,
    userId: string,
  ): Promise<AddedHouseholdMember> {
    return this.dataSource.transaction(async (manager) => {
      const requesterMembership = await manager.findOne(HouseholdMemberEntity, {
        select: { id: true, role: true },
        where: {
          household: { id: householdId },
          user: { id: requesterId },
        },
        lock: { mode: 'pessimistic_read' },
      });

      if (requesterMembership?.role !== 'owner') {
        throw new ForbiddenError();
      }

      const repository = manager.getRepository(HouseholdMemberEntity);
      const alreadyMember = await repository.existsBy({
        household: { id: householdId },
        user: { id: userId },
      });

      if (alreadyMember) {
        throw new AlreadyHouseholdMemberError();
      }

      const membership = repository.create({
        household: { id: householdId },
        user: { id: userId },
        role: 'member',
      });

      try {
        const savedMembership = await repository.save(membership);

        if (savedMembership.role !== 'member') {
          throw new Error('The household member could not be created.');
        }

        return {
          role: savedMembership.role,
          joinedAt: savedMembership.joinedAt,
        };
      } catch (error: unknown) {
        if (isHouseholdMemberUniqueViolation(error)) {
          throw new AlreadyHouseholdMemberError();
        }

        throw error;
      }
    });
  }
}
