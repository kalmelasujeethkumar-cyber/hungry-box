import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BranchDto, UserRole } from '@hungrybox/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { toBranchDto } from './branch.mapper';
import type { CreateBranchDto } from './dto/create-branch.dto';
import type { SetBranchStatusDto } from './dto/set-branch-status.dto';
import type { UpdateBranchDto } from './dto/update-branch.dto';
import type { UpdateBranchSettingsDto } from './dto/update-branch-settings.dto';

export interface BranchSettingsActor {
  role: UserRole;
  branchId: string | null;
  userId: string;
}

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<BranchDto[]> {
    const db = this.prisma.requireClient();
    const branches = await db.branch.findMany({
      orderBy: { name: 'asc' },
    });
    return branches.map(toBranchDto);
  }

  async findById(id: string): Promise<BranchDto> {
    const db = this.prisma.requireClient();
    const branch = await db.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return toBranchDto(branch);
  }

  async create(dto: CreateBranchDto): Promise<BranchDto> {
    const db = this.prisma.requireClient();
    try {
      const branch = await db.branch.create({
        data: {
          code: dto.code,
          name: dto.name,
          city: dto.city,
          state: dto.state,
          country: dto.country,
          address: dto.address ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          deliveryRadiusKm: dto.deliveryRadiusKm,
        },
      });
      return toBranchDto(branch);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Branch code already exists');
      }
      throw error;
    }
  }

  async update(actor: BranchSettingsActor, id: string, dto: UpdateBranchDto): Promise<BranchDto> {
    const db = this.prisma.requireClient();
    const branch = await db.branch.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const data: Prisma.BranchUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.deliveryRadiusKm !== undefined) data.deliveryRadiusKm = dto.deliveryRadiusKm;

    const updated = await db.branch.update({ where: { id }, data });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.BRANCH_UPDATED,
      entityType: 'branch',
      entityId: id,
      branchId: id,
      message: `Branch ${branch.name} details updated`,
    });

    return toBranchDto(updated);
  }

  async setStatus(
    actor: BranchSettingsActor,
    id: string,
    dto: SetBranchStatusDto,
  ): Promise<BranchDto> {
    const db = this.prisma.requireClient();
    const branch = await db.branch.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (branch.status === dto.status) {
      throw new BadRequestException(`Branch is already ${dto.status.toLowerCase()}`);
    }

    const updated = await db.branch.update({ where: { id }, data: { status: dto.status } });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.BRANCH_STATUS_CHANGED,
      entityType: 'branch',
      entityId: id,
      branchId: id,
      message: `Branch ${branch.name} status changed to ${dto.status}`,
    });

    return toBranchDto(updated);
  }

  async getSettings(actor: BranchSettingsActor, branchIdQuery?: string): Promise<BranchDto> {
    const branchId = this.resolveSettingsBranchId(actor, branchIdQuery);
    return this.findById(branchId);
  }

  async updateSettings(
    actor: BranchSettingsActor,
    dto: UpdateBranchSettingsDto,
    branchIdQuery?: string,
  ): Promise<BranchDto> {
    const db = this.prisma.requireClient();
    const branchId = this.resolveSettingsBranchId(actor, branchIdQuery);
    const branch = await db.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const data: Prisma.BranchUpdateInput = {};
    if (dto.deliveryRadiusKm !== undefined) {
      data.deliveryRadiusKm = dto.deliveryRadiusKm;
    }
    if (dto.address !== undefined) {
      data.address = dto.address;
    }

    const updated = await db.branch.update({ where: { id: branchId }, data });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.BRANCH_SETTINGS_UPDATED,
      entityType: 'branch',
      entityId: branchId,
      branchId,
      message: `Branch settings updated for ${branch.name}`,
    });

    return toBranchDto(updated);
  }

  /**
   * BRANCH_MANAGER is always pinned to their own branch; a client-supplied
   * branchId is only honoured for SUPER_ADMIN.
   */
  private resolveSettingsBranchId(actor: BranchSettingsActor, branchIdQuery?: string): string {
    if (actor.role === 'BRANCH_MANAGER') {
      if (!actor.branchId) {
        throw new ForbiddenException('Branch manager has no assigned branch');
      }
      return actor.branchId;
    }
    if (!branchIdQuery) {
      throw new BadRequestException('branchId is required for super-admin settings access');
    }
    return branchIdQuery;
  }
}
