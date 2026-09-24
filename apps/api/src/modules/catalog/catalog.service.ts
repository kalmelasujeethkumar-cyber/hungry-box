import { Injectable, NotFoundException } from '@nestjs/common';
import type { CatalogProduct, CatalogProductDetail } from '@hungrybox/shared';
import { BranchProductStatus, BranchStatus, CatalogStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CategoryListItem } from '../categories/categories.service';
import type { CatalogQueryDto } from './dto/catalog-query.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: CatalogQueryDto): Promise<CatalogProduct[]> {
    const db = this.prisma.requireClient();
    await this.assertActiveBranch(query.branchId);

    const products = await db.product.findMany({
      where: {
        status: CatalogStatus.ACTIVE,
        ...(query.categorySlug ? { category: { slug: query.categorySlug } } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        branchProducts: {
          some: {
            branchId: query.branchId,
            status: BranchProductStatus.ACTIVE,
            isAvailable: true,
          },
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        category: { select: { name: true, slug: true } },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { imageUrl: true },
        },
        branchProducts: {
          where: {
            branchId: query.branchId,
            status: BranchProductStatus.ACTIVE,
            isAvailable: true,
          },
          take: 1,
          select: {
            priceMinor: true,
            discountMinor: true,
            isAvailable: true,
          },
        },
      },
    });

    return products.flatMap((product) => {
      const branchConfig = product.branchProducts[0];
      if (!branchConfig) {
        // Unreachable given the `some` filter; defensive mapping keeps types total.
        return [];
      }
      return [
        {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          categoryName: product.category?.name ?? null,
          categorySlug: product.category?.slug ?? null,
          imageUrl: product.images[0]?.imageUrl ?? null,
          priceMinor: branchConfig.priceMinor,
          discountMinor: branchConfig.discountMinor,
          effectivePriceMinor: branchConfig.priceMinor - branchConfig.discountMinor,
          isAvailable: branchConfig.isAvailable,
        },
      ];
    });
  }

  async getProductDetail(productId: string, branchId: string): Promise<CatalogProductDetail> {
    const db = this.prisma.requireClient();
    await this.assertActiveBranch(branchId);

    const product = await db.product.findFirst({
      where: { id: productId, status: CatalogStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        category: { select: { id: true, name: true, slug: true } },
        images: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            imageUrl: true,
            altText: true,
            sortOrder: true,
            isPrimary: true,
          },
        },
        branchProducts: {
          where: { branchId, status: BranchProductStatus.ACTIVE },
          take: 1,
          select: { priceMinor: true, discountMinor: true, isAvailable: true },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const branchConfig = product.branchProducts[0];
    if (!branchConfig) {
      throw new NotFoundException('Product not available at this branch');
    }

    const primaryImage = product.images.find((image) => image.isPrimary);
    return {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.category?.id ?? null,
      categoryName: product.category?.name ?? null,
      categorySlug: product.category?.slug ?? null,
      images: product.images.map((image) => ({
        id: image.id,
        imageUrl: image.imageUrl,
        altText: image.altText,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
      imageUrl: primaryImage?.imageUrl ?? product.images[0]?.imageUrl ?? null,
      priceMinor: branchConfig.priceMinor,
      discountMinor: branchConfig.discountMinor,
      effectivePriceMinor: branchConfig.priceMinor - branchConfig.discountMinor,
      isAvailable: branchConfig.isAvailable,
    };
  }

  async listCategories(branchId?: string): Promise<CategoryListItem[]> {
    const db = this.prisma.requireClient();
    if (branchId) {
      await this.assertActiveBranch(branchId);
    }

    const categories = await db.category.findMany({
      where: {
        status: CatalogStatus.ACTIVE,
        ...(branchId
          ? {
              products: {
                some: {
                  status: CatalogStatus.ACTIVE,
                  branchProducts: {
                    some: {
                      branchId,
                      status: BranchProductStatus.ACTIVE,
                      isAvailable: true,
                    },
                  },
                },
              },
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        sortOrder: true,
      },
    });
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      sortOrder: category.sortOrder,
    }));
  }

  private async assertActiveBranch(branchId: string): Promise<void> {
    const db = this.prisma.requireClient();
    const branch = await db.branch.findUnique({
      where: { id: branchId },
      select: { id: true, status: true },
    });
    if (!branch || branch.status !== BranchStatus.ACTIVE) {
      throw new NotFoundException('Branch not found or inactive');
    }
  }
}
