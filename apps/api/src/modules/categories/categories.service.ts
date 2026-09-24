import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CategoryDto, UserRole } from '@hungrybox/shared';
import { Prisma, CatalogStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export interface CategoryActor {
  role: UserRole;
  branchId: string | null;
  userId: string;
}

export interface CategoryListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || 'category';
}

function toCategoryDto(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
}): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  status: true,
  sortOrder: true,
} as const;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<CategoryDto[]> {
    const db = this.prisma.requireClient();
    const categories = await db.category.findMany({
      where: { status: CatalogStatus.ACTIVE },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: categorySelect,
    });
    return categories.map(toCategoryDto);
  }

  async listAdmin(): Promise<CategoryDto[]> {
    const db = this.prisma.requireClient();
    const categories = await db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: categorySelect,
    });
    return categories.map(toCategoryDto);
  }

  async create(actor: CategoryActor, dto: CreateCategoryDto): Promise<CategoryDto> {
    const db = this.prisma.requireClient();
    const slug = dto.slug?.trim() || slugify(dto.name);

    let category;
    try {
      category = await db.category.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description ?? null,
          imageUrl: dto.imageUrl ?? null,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: categorySelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Category slug already exists');
      }
      throw error;
    }

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.CATEGORY_CREATED,
      entityType: 'category',
      entityId: category.id,
      message: `Category created (${category.name})`,
    });

    return toCategoryDto(category);
  }

  async update(actor: CategoryActor, id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const db = this.prisma.requireClient();
    const existing = await db.category.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug.trim() || slugify(dto.name ?? existing.name);
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) data.status = dto.status;

    try {
      await db.category.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Category slug already exists');
      }
      throw error;
    }

    const category = await db.category.findUniqueOrThrow({
      where: { id },
      select: categorySelect,
    });

    const statusChanged = dto.status !== undefined && dto.status !== existing.status;
    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: statusChanged ? AuditKinds.CATEGORY_STATUS_CHANGED : AuditKinds.CATEGORY_UPDATED,
      entityType: 'category',
      entityId: id,
      message: statusChanged
        ? `Category ${category.name} status changed to ${dto.status}`
        : `Category updated (${category.name})`,
    });

    return toCategoryDto(category);
  }
}
