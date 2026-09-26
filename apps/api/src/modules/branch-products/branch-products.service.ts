import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BranchProductDto } from '@hungrybox/shared';
import {
  BranchProductStatus,
  BranchStatus,
  CatalogStatus,
  Prisma,
} from '../../generated/prisma/client';
import type { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCatalogImageUrl } from '../../common/utils/catalog-image';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { BranchScopedActor, enforcedBranchId } from './branch-scope';
import { CreateBranchProductDto } from './dto/create-branch-product.dto';
import { UpdateBranchProductDto } from './dto/update-branch-product.dto';

export type BranchProductActor = BranchScopedActor;

const branchProductSelect = {
  id: true,
  productId: true,
  priceMinor: true,
  discountMinor: true,
  isAvailable: true,
  status: true,
  product: {
    select: {
      name: true,
      slug: true,
      category: {
        select: { name: true, slug: true, imageUrl: true },
      },
      images: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, imageUrl: true, altText: true, sortOrder: true, isPrimary: true },
      },
    },
  },
  images: {
    orderBy: { sortOrder: 'asc' },
    select: { id: true, imageUrl: true, altText: true, sortOrder: true, isPrimary: true },
  },
} as const;

type BranchProductImageRow = {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
};

type BranchProductRow = {
  id: string;
  productId: string;
  priceMinor: number;
  discountMinor: number;
  isAvailable: boolean;
  status: BranchProductStatus;
  product: {
    name: string;
    slug: string;
    category: { name: string; slug: string; imageUrl: string | null } | null;
    images: BranchProductImageRow[];
  };
  images: BranchProductImageRow[];
};

@Injectable()
export class BranchProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: BranchProductActor, dto: CreateBranchProductDto): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();
    this.assertBranchManaged(actor, dto.branchId);

    const branch = await db.branch.findUnique({
      where: { id: dto.branchId },
      select: { id: true, status: true },
    });
    if (!branch || branch.status !== BranchStatus.ACTIVE) {
      throw new BadRequestException('Branch not found or inactive');
    }

    const product = await db.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, status: true, name: true },
    });
    if (!product || product.status !== CatalogStatus.ACTIVE) {
      throw new NotFoundException('Product not found or inactive');
    }

    const discountMinor = dto.discountMinor ?? 0;
    if (discountMinor > dto.priceMinor) {
      throw new BadRequestException('Discount cannot exceed price');
    }

    let row: BranchProductRow;
    try {
      row = await db.branchProduct.create({
        data: {
          branchId: dto.branchId,
          productId: dto.productId,
          priceMinor: dto.priceMinor,
          discountMinor,
          isAvailable: dto.isAvailable ?? true,
        },
        select: branchProductSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Branch product already exists for this product');
      }
      throw error;
    }

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.BRANCH_PRODUCT_CREATED,
      entityType: 'branch_product',
      entityId: row.id,
      branchId: dto.branchId,
      message: `Branch product configured for ${product.name}`,
    });

    return this.toItem(row);
  }

  async listForBranch(branchId: string): Promise<BranchProductDto[]> {
    const db = this.prisma.requireClient();
    const branch = await db.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    const rows = await db.branchProduct.findMany({
      where: { branchId },
      orderBy: { createdAt: 'asc' },
      select: branchProductSelect,
    });
    return rows.map((row) => this.toItem(row));
  }

  async update(
    actor: BranchProductActor,
    branchProductId: string,
    dto: UpdateBranchProductDto,
  ): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();
    const scopeBranchId = enforcedBranchId(actor);
    const existing = await db.branchProduct.findUnique({
      where: { id: branchProductId },
      select: {
        id: true,
        branchId: true,
        priceMinor: true,
        discountMinor: true,
        product: { select: { name: true } },
      },
    });
    if (!existing || (scopeBranchId !== null && existing.branchId !== scopeBranchId)) {
      throw new NotFoundException('Branch product not found');
    }

    const priceMinor = dto.priceMinor ?? existing.priceMinor;
    const discountMinor = dto.discountMinor ?? existing.discountMinor;
    if (discountMinor > priceMinor) {
      throw new BadRequestException('Discount cannot exceed price');
    }

    await db.$transaction(async (tx) => {
      await tx.branchProduct.update({
        where: { id: existing.id },
        data: {
          ...(dto.priceMinor !== undefined ? { priceMinor: dto.priceMinor } : {}),
          ...(dto.discountMinor !== undefined ? { discountMinor: dto.discountMinor } : {}),
          ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.BRANCH_PRODUCT_UPDATED,
          entityType: 'branch_product',
          entityId: existing.id,
          branchId: existing.branchId,
          message: `Branch product updated for ${existing.product.name}`,
        },
        tx,
      );
    });

    return this.getById(existing.id);
  }

  async remove(actor: BranchProductActor, branchProductId: string): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();
    const scopeBranchId = enforcedBranchId(actor);
    const existing = await db.branchProduct.findUnique({
      where: { id: branchProductId },
      select: { id: true, branchId: true, product: { select: { name: true } } },
    });
    if (!existing || (scopeBranchId !== null && existing.branchId !== scopeBranchId)) {
      throw new NotFoundException('Branch product not found');
    }

    await db.$transaction(async (tx) => {
      await tx.branchProduct.update({
        where: { id: existing.id },
        data: { status: BranchProductStatus.INACTIVE, isAvailable: false },
      });
      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.BRANCH_PRODUCT_DEACTIVATED,
          entityType: 'branch_product',
          entityId: existing.id,
          branchId: existing.branchId,
          message: `Branch product deactivated for ${existing.product.name}`,
        },
        tx,
      );
    });

    return this.getById(existing.id);
  }

  /** Branch products are never hard-deleted; only soft-deactivated. */
  private async getById(branchProductId: string): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();
    const row = await db.branchProduct.findUnique({
      where: { id: branchProductId },
      select: branchProductSelect,
    });
    if (!row) {
      throw new NotFoundException('Branch product not found');
    }
    return this.toItem(row);
  }

  /**
   * Reads a branch product inside the actor's authoritative branch scope. Used by
   * branch media flows so a foreign branch product resolves as not found rather
   * than leaking its existence.
   */
  async getForActor(actor: BranchProductActor, branchProductId: string): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();
    await this.requireOwnedBranchProduct(db, actor, branchProductId);
    return this.getById(branchProductId);
  }

  private async requireOwnedBranchProduct(
    db: PrismaClient,
    actor: BranchProductActor,
    branchProductId: string,
  ): Promise<{ id: string; branchId: string }> {
    const scopeBranchId = enforcedBranchId(actor);
    const existing = await db.branchProduct.findUnique({
      where: { id: branchProductId },
      select: { id: true, branchId: true },
    });
    if (!existing || (scopeBranchId !== null && existing.branchId !== scopeBranchId)) {
      throw new NotFoundException('Branch product not found');
    }
    return existing;
  }

  private assertBranchManaged(actor: BranchProductActor, branchId: string): void {
    const scopeBranchId = enforcedBranchId(actor);
    if (scopeBranchId !== null && scopeBranchId !== branchId) {
      throw new ForbiddenException('Cannot configure products for another branch');
    }
  }

  private toItem(row: BranchProductRow): BranchProductDto {
    const branchImages = row.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      altText: image.altText,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    }));
    const globalImages = row.product.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      altText: image.altText,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    }));
    return {
      id: row.id,
      productId: row.productId,
      priceMinor: row.priceMinor,
      discountMinor: row.discountMinor,
      effectivePriceMinor: row.priceMinor - row.discountMinor,
      isAvailable: row.isAvailable,
      status: row.status,
      imageUrl: resolveCatalogImageUrl({
        branchImages,
        globalImages,
        categoryImageUrl: row.product.category?.imageUrl ?? null,
      }),
      branchImages,
      globalImages,
      product: {
        name: row.product.name,
        slug: row.product.slug,
        categoryName: row.product.category?.name ?? null,
        categorySlug: row.product.category?.slug ?? null,
      },
    };
  }
}
