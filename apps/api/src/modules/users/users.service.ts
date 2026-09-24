import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashSync } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import type {
  AuthUser,
  CreateManagerResultDto,
  UserListQuery,
  UserListResultDto,
  UserListItemDto,
} from '@hungrybox/shared';
import { Prisma } from '../../generated/prisma/client';
import { UserStatus } from '../../generated/prisma/enums';
import { normalizeLoginId } from '../../common/utils/login-id';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { toPublicUser, toUserListItem } from './user.mapper';
import type { CreateManagerDto } from './dto/create-manager.dto';
import type { SetUserStatusDto } from './dto/set-user-status.dto';

export interface UserActor {
  role: string;
  branchId: string | null;
  userId: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function randomPassword(): string {
  return randomBytes(6).toString('base64url');
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findPublicById(id: string): Promise<AuthUser> {
    const db = this.prisma.requireClient();
    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async listUsers(query: UserListQuery): Promise<UserListResultDto> {
    const db = this.prisma.requireClient();
    const where = this.buildWhere(query);
    const page = this.page(query);
    const limit = this.limit(query);

    const [rows, total] = await Promise.all([
      db.user.findMany({
        where,
        include: { branch: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    return {
      items: rows.map((row) => toUserListItem(row)),
      total,
      page,
      limit,
    };
  }

  async createManager(actor: UserActor, dto: CreateManagerDto): Promise<CreateManagerResultDto> {
    const db = this.prisma.requireClient();
    const loginId = normalizeLoginId(dto.loginId);

    return db.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { loginId } });
      if (existingUser) {
        throw new ConflictException('A user with this login id already exists');
      }

      const branch = await tx.branch.findUnique({
        where: { id: dto.branchId },
        select: { id: true, name: true },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }

      const password = randomPassword();
      const user = await tx.user.create({
        data: {
          loginId,
          name: dto.name,
          passwordHash: hashSync(password),
          role: 'BRANCH_MANAGER',
          status: UserStatus.ACTIVE,
          branchId: branch.id,
        },
        include: { branch: { select: { name: true } } },
      });

      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.USER_CREATED,
          entityType: 'user',
          entityId: user.id,
          branchId: branch.id,
          message: `Branch manager created for ${branch.name}`,
        },
        tx,
      );

      return { manager: toUserListItem(user), temporaryPassword: password };
    });
  }

  async setUserStatus(
    actor: UserActor,
    userId: string,
    dto: SetUserStatusDto,
  ): Promise<UserListItemDto> {
    const db = this.prisma.requireClient();
    const target = await db.user.findUnique({
      where: { id: userId },
      include: { branch: { select: { name: true } } },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role !== 'BRANCH_MANAGER') {
      throw new ForbiddenException('Only branch manager status can be changed here');
    }
    if (actor.userId === userId) {
      throw new BadRequestException('You cannot change your own status');
    }
    if (target.status === dto.status) {
      throw new BadRequestException(`User is already ${dto.status.toLowerCase()}`);
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { status: dto.status },
      include: { branch: { select: { name: true } } },
    });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.USER_STATUS_CHANGED,
      entityType: 'user',
      entityId: userId,
      branchId: target.branchId,
      message: `Status for manager ${target.name ?? target.loginId} changed to ${dto.status}`,
    });

    return toUserListItem(updated);
  }

  private buildWhere(query: UserListQuery): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (query.role) {
      where.role = query.role;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search?.trim()) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { loginId: { contains: query.search.trim(), mode: 'insensitive' } },
        { email: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private page(query: UserListQuery): number {
    const page = Number(query.page);
    return Number.isInteger(page) && page >= 1 ? page : DEFAULT_PAGE;
  }

  private limit(query: UserListQuery): number {
    const limit = Number(query.limit);
    if (Number.isInteger(limit) && limit >= 1) {
      return Math.min(limit, MAX_LIMIT);
    }
    return DEFAULT_LIMIT;
  }
}
