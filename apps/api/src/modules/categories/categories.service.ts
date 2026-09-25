import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryDto, UserRole } from '@hungrybox/shared';
import { Prisma, CatalogStatus } from '../../generated/prisma/client';
import type { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { MEDIA_STORAGE_PROVIDER } from '../media/media-storage-provider.interface';
import type {
  MediaStorageProvider,
  PublicImageFile,
} from '../media/media-storage-provider.interface';
import { validatePublicImage } from '../media/public-image-validator';
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
    @Inject(MEDIA_STORAGE_PROVIDER) private readonly mediaStorage: MediaStorageProvider,
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

  async uploadImage(
    actor: CategoryActor,
    categoryId: string,
    file: PublicImageFile,
  ): Promise<CategoryDto> {
    const db = this.prisma.requireClient();
    validatePublicImage(file);

    const current = await db.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundException('Category not found');
    }

    const stored = await this.mediaStorage.uploadPublicImage({
      buffer: file.buffer,
      folder: `hungry-box/catalog/categories/${categoryId}`,
      publicId: randomUUID(),
    });

    let previousPublicId: string | null;
    try {
      previousPublicId = await db.$transaction(async (tx) => {
        await this.requireCategoryLock(tx, categoryId);
        const row = await tx.category.findUnique({
          where: { id: categoryId },
          select: { imagePublicId: true },
        });
        if (!row) {
          throw new NotFoundException('Category not found');
        }
        await tx.category.update({
          where: { id: categoryId },
          data: {
            imageUrl: stored.secureUrl,
            imagePublicId: stored.publicId,
            imageResourceType: stored.resourceType,
          },
        });
        return row.imagePublicId;
      });
    } catch (error) {
      await this.bestEffortDeleteAsset(
        'category',
        categoryId,
        stored.publicId,
        `Orphaned asset rejected after aborted category image upload`,
      );
      throw error;
    }

    if (previousPublicId) {
      await this.bestEffortDeleteAsset(
        'category',
        categoryId,
        previousPublicId,
        `Failed to delete replaced category image asset (${categoryId})`,
      );
    }

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: previousPublicId
        ? AuditKinds.CATEGORY_IMAGE_REPLACED
        : AuditKinds.CATEGORY_IMAGE_UPLOADED,
      entityType: 'category',
      entityId: categoryId,
      message: previousPublicId
        ? `Category image replaced (${categoryId})`
        : `Category image uploaded (${categoryId})`,
    });

    const category = await db.category.findUniqueOrThrow({
      where: { id: categoryId },
      select: categorySelect,
    });
    return toCategoryDto(category);
  }

  async removeImage(actor: CategoryActor, categoryId: string): Promise<CategoryDto> {
    const db = this.prisma.requireClient();

    const removedPublicId = await db.$transaction(async (tx) => {
      await this.requireCategoryLock(tx, categoryId);
      const current = await tx.category.findUnique({
        where: { id: categoryId },
        select: { imagePublicId: true },
      });
      if (!current) {
        throw new NotFoundException('Category not found');
      }
      if (!current.imagePublicId) {
        throw new BadRequestException('Category does not have an image');
      }
      await tx.category.update({
        where: { id: categoryId },
        data: { imageUrl: null, imagePublicId: null, imageResourceType: null },
      });
      return current.imagePublicId;
    });

    await this.bestEffortDeleteAsset(
      'category',
      categoryId,
      removedPublicId,
      `Failed to delete category image asset (${categoryId})`,
    );

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.CATEGORY_IMAGE_REMOVED,
      entityType: 'category',
      entityId: categoryId,
      message: `Category image removed (${categoryId})`,
    });

    const category = await db.category.findUniqueOrThrow({
      where: { id: categoryId },
      select: categorySelect,
    });
    return toCategoryDto(category);
  }

  private async requireCategoryLock(
    db: PrismaClient | Prisma.TransactionClient,
    categoryId: string,
  ): Promise<void> {
    const locked = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Category" WHERE id = ${categoryId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundException('Category not found');
    }
  }

  private async bestEffortDeleteAsset(
    entityType: string,
    entityId: string,
    publicId: string,
    message: string,
  ): Promise<void> {
    try {
      await this.mediaStorage.deletePublicImage(publicId);
    } catch {
      try {
        await this.audit.record({
          actorRole: 'SYSTEM',
          kind: AuditKinds.MEDIA_CLEANUP_FAILED,
          entityType,
          entityId,
          message,
        });
      } catch {
        // Cleanup is best-effort by contract; a failing audit write must not surface.
      }
    }
  }
}
