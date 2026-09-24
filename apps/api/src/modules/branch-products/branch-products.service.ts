import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchStatus, CatalogStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBranchProductDto } from './dto/create-branch-product.dto';

export interface BranchProductItem {
  id: string;
  productId: string;
  priceMinor: number;
  discountMinor: number;
  effectivePriceMinor: number;
  isAvailable: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  product: {
    name: string;
    slug: string;
    categoryName: string | null;
    categorySlug: string | null;
  };
}

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
        select: { name: true, slug: true },
      },
    },
  },
} as const;

@Injectable()
export class BranchProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBranchProductDto): Promise<BranchProductItem> {
    const db = this.prisma.requireClient();
    const branch = await db.branch.findUnique({
      where: { id: dto.branchId },
      select: { id: true, status: true },
    });
    if (!branch || branch.status !== BranchStatus.ACTIVE) {
      throw new NotFoundException('Branch not found or inactive');
    }

    const product = await db.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, status: true },
    });
    if (!product || product.status !== CatalogStatus.ACTIVE) {
      throw new NotFoundException('Product not found or inactive');
    }

    const discountMinor = dto.discountMinor ?? 0;
    if (discountMinor > dto.priceMinor) {
      throw new ConflictException('Discount cannot exceed price');
    }

    const row = await db.branchProduct.create({
      data: {
        branchId: dto.branchId,
        productId: dto.productId,
        priceMinor: dto.priceMinor,
        discountMinor,
        isAvailable: dto.isAvailable ?? true,
      },
      select: branchProductSelect,
    });
    return this.toItem(row);
  }

  async listForBranch(branchId: string): Promise<BranchProductItem[]> {
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

  private toItem(row: {
    id: string;
    productId: string;
    priceMinor: number;
    discountMinor: number;
    isAvailable: boolean;
    status: 'ACTIVE' | 'INACTIVE';
    product: {
      name: string;
      slug: string;
      category: { name: string; slug: string } | null;
    };
  }): BranchProductItem {
    return {
      id: row.id,
      productId: row.productId,
      priceMinor: row.priceMinor,
      discountMinor: row.discountMinor,
      effectivePriceMinor: row.priceMinor - row.discountMinor,
      isAvailable: row.isAvailable,
      status: row.status,
      product: {
        name: row.product.name,
        slug: row.product.slug,
        categoryName: row.product.category?.name ?? null,
        categorySlug: row.product.category?.slug ?? null,
      },
    };
  }
}
