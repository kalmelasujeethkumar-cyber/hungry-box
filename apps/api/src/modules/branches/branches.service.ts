import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BranchDto } from '@hungrybox/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toBranchDto } from './branch.mapper';
import type { CreateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

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
}
