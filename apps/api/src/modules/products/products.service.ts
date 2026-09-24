import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { GlobalProductDetailDto, GlobalProductListItemDto, UserRole } from '@hungrybox/shared';
import { Prisma, CatalogStatus } from '../../generated/prisma/client';
import type { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { SetProductStatusDto } from './dto/set-product-status.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import {
  ProductAdminRow,
  ProductDetail,
  ProductImageReference,
  ProductSummary,
  productAdminSelect,
  toGlobalProductDetail,
  toGlobalProductListItem,
} from './product.mapper';

export interface ProductActor {
  role: UserRole;
  branchId: string | null;
  userId: string;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ProductSummary[]> {
    const db = this.prisma.requireClient();
    const products = await db.product.findMany({
      where: { status: CatalogStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { imageUrl: true, altText: true },
        },
      },
    });
    return products.map((product) => this.toSummary(product));
  }

  async listAdmin(): Promise<GlobalProductListItemDto[]> {
    const db = this.prisma.requireClient();
    const rows = await db.product.findMany({
      orderBy: { name: 'asc' },
      select: productAdminSelect,
    });
    return rows.map((row) => toGlobalProductListItem(row as unknown as ProductAdminRow));
  }

  async getById(id: string): Promise<ProductDetail> {
    const db = this.prisma.requireClient();
    const product = await db.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
        images: {
          orderBy: { sortOrder: 'asc' },
          select: { imageUrl: true, altText: true },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: product.status,
      category: product.category,
      primaryImage: product.images[0] ?? null,
      images: product.images,
    };
  }

  async getAdminDetail(id: string): Promise<GlobalProductDetailDto> {
    const db = this.prisma.requireClient();
    const row = await this.findAdminRow(db, id);
    return toGlobalProductDetail(row as unknown as ProductAdminRow);
  }

  async create(actor: ProductActor, dto: CreateProductDto): Promise<ProductSummary> {
    const db = this.prisma.requireClient();

    if (dto.categoryId) {
      await this.requireActiveCategory(db, dto.categoryId);
    }

    try {
      const product = await db.product.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description ?? null,
          categoryId: dto.categoryId ?? null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          category: {
            select: { id: true, name: true, slug: true },
          },
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { imageUrl: true, altText: true },
          },
        },
      });

      await this.audit.record({
        actorRole: actor.role,
        actorId: actor.userId,
        kind: AuditKinds.PRODUCT_CREATED,
        entityType: 'product',
        entityId: product.id,
        message: `Product created (${product.name})`,
      });

      return this.toSummary(product);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Product slug already exists');
      }
      throw error;
    }
  }

  async update(
    actor: ProductActor,
    id: string,
    dto: UpdateProductDto,
  ): Promise<GlobalProductDetailDto> {
    const db = this.prisma.requireClient();
    await this.findAdminRow(db, id);

    if (dto.categoryId) {
      await this.requireActiveCategory(db, dto.categoryId);
    }

    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId ? { connect: { id: dto.categoryId } } : { disconnect: true };
    }

    try {
      await db.product.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Product slug already exists');
      }
      throw error;
    }

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.PRODUCT_UPDATED,
      entityType: 'product',
      entityId: id,
      message: `Product updated (${dto.name ?? dto.slug ?? id})`,
    });

    const row = await this.findAdminRow(db, id);
    return toGlobalProductDetail(row as unknown as ProductAdminRow);
  }

  async setStatus(
    actor: ProductActor,
    id: string,
    dto: SetProductStatusDto,
  ): Promise<GlobalProductDetailDto> {
    const db = this.prisma.requireClient();
    const row = await this.findAdminRow(db, id);
    if (row.status === dto.status) {
      throw new BadRequestException(`Product is already ${dto.status.toLowerCase()}`);
    }

    await db.product.update({ where: { id }, data: { status: dto.status } });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.PRODUCT_STATUS_CHANGED,
      entityType: 'product',
      entityId: id,
      message: `Product ${row.name} status changed to ${dto.status}`,
    });

    const updated = await this.findAdminRow(db, id);
    return toGlobalProductDetail(updated as unknown as ProductAdminRow);
  }

  async addImage(
    actor: ProductActor,
    productId: string,
    dto: CreateProductImageDto,
  ): Promise<GlobalProductDetailDto> {
    const db = this.prisma.requireClient();

    await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const imageCount = await tx.productImage.count({ where: { productId } });
      const isPrimary = dto.isPrimary ?? imageCount === 0;

      if (isPrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      await tx.productImage.create({
        data: {
          productId,
          imageUrl: dto.imageUrl,
          altText: dto.altText ?? null,
          sortOrder: dto.sortOrder ?? imageCount,
          isPrimary,
        },
      });
    });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.PRODUCT_IMAGE_ADDED,
      entityType: 'product_image',
      entityId: productId,
      message: `Image added to product ${productId}`,
    });

    const row = await this.findAdminRow(db, productId);
    return toGlobalProductDetail(row as unknown as ProductAdminRow);
  }

  async updateImage(
    actor: ProductActor,
    imageId: string,
    dto: UpdateProductImageDto,
  ): Promise<GlobalProductDetailDto> {
    const db = this.prisma.requireClient();

    const productId = await db.$transaction(async (tx) => {
      const image = await tx.productImage.findUnique({
        where: { id: imageId },
        select: { productId: true },
      });
      if (!image) {
        throw new NotFoundException('Image not found');
      }
      if (dto.isPrimary) {
        await tx.productImage.updateMany({
          where: { productId: image.productId, isPrimary: true, NOT: { id: imageId } },
          data: { isPrimary: false },
        });
      }
      await tx.productImage.update({
        where: { id: imageId },
        data: {
          altText: dto.altText,
          sortOrder: dto.sortOrder,
          isPrimary: dto.isPrimary,
        },
      });
      return image.productId;
    });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.PRODUCT_IMAGE_UPDATED,
      entityType: 'product_image',
      entityId: imageId,
      message: `Image updated for product ${productId}`,
    });

    const row = await this.findAdminRow(db, productId);
    return toGlobalProductDetail(row as unknown as ProductAdminRow);
  }

  async removeImage(actor: ProductActor, imageId: string): Promise<GlobalProductDetailDto> {
    const db = this.prisma.requireClient();

    const productId = await db.$transaction(async (tx) => {
      const image = await tx.productImage.findUnique({
        where: { id: imageId },
        select: { productId: true, isPrimary: true },
      });
      if (!image) {
        throw new NotFoundException('Image not found');
      }
      await tx.productImage.delete({ where: { id: imageId } });
      if (image.isPrimary) {
        const next = await tx.productImage.findFirst({
          where: { productId: image.productId },
          orderBy: { sortOrder: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }
      return image.productId;
    });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.PRODUCT_IMAGE_REMOVED,
      entityType: 'product_image',
      entityId: imageId,
      message: `Image removed from product ${productId}`,
    });

    const row = await this.findAdminRow(db, productId);
    return toGlobalProductDetail(row as unknown as ProductAdminRow);
  }

  private async findAdminRow(db: PrismaClient, id: string) {
    const row = await db.product.findUnique({ where: { id }, select: productAdminSelect });
    if (!row) {
      throw new NotFoundException('Product not found');
    }
    return row;
  }

  private async requireActiveCategory(db: PrismaClient, categoryId: string) {
    const category = await db.category.findUnique({
      where: { id: categoryId },
      select: { id: true, status: true },
    });
    if (!category || category.status !== CatalogStatus.ACTIVE) {
      throw new BadRequestException('Category not found or inactive');
    }
  }

  private toSummary(product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    category: { id: string; name: string; slug: string } | null;
    images: ProductImageReference[];
  }): ProductSummary {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: product.status,
      category: product.category,
      primaryImage: product.images[0] ?? null,
    };
  }
}
