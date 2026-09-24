import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';

function buildService(db: Record<string, unknown>) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  return new CatalogService(prisma);
}

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    name: 'Special Chicken Biryani',
    slug: 'special-chicken-biryani',
    description: 'Served with raita',
    category: { name: 'Biryani & Rice Meals', slug: 'biryani-and-rice' },
    images: [{ imageUrl: 'https://cdn.example/1.jpg' }],
    branchProducts: [{ priceMinor: 29900, discountMinor: 2000, isAvailable: true }],
    ...overrides,
  };
}

describe('CatalogService.listProducts', () => {
  it('returns catalog products with effective price computed', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: { findMany: vi.fn().mockResolvedValue([productRow()]) },
    };
    const service = buildService(db);

    const result = await service.listProducts({ branchId: 'b1' });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      productId: 'product-1',
      priceMinor: 29900,
      discountMinor: 2000,
      effectivePriceMinor: 27900,
      isAvailable: true,
      categorySlug: 'biryani-and-rice',
      imageUrl: 'https://cdn.example/1.jpg',
    });
  });

  it('passes optional filters to the query', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = buildService(db);

    await service.listProducts({
      branchId: 'b1',
      categorySlug: 'starters',
      q: 'paneer',
    });

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: { slug: 'starters' },
          OR: [
            { name: { contains: 'paneer', mode: 'insensitive' } },
            { description: { contains: 'paneer', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('searches across the product description', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = buildService(db);

    await service.listProducts({ branchId: 'b1', q: 'raita' });

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'raita', mode: 'insensitive' } },
            { description: { contains: 'raita', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('throws NotFoundException for an inactive branch', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'INACTIVE' }),
      },
    };
    const service = buildService(db);

    await expect(service.listProducts({ branchId: 'b1' })).rejects.toThrow(NotFoundException);
  });
});

describe('CatalogService.getProductDetail', () => {
  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'product-1',
      name: 'Special Chicken Biryani',
      slug: 'special-chicken-biryani',
      description: 'Served with raita',
      category: { id: 'cat-1', name: 'Biryani & Rice Meals', slug: 'biryani-and-rice' },
      images: [
        {
          id: 'img-1',
          imageUrl: 'https://cdn.example/1.jpg',
          altText: 'Biryani',
          sortOrder: 0,
          isPrimary: true,
        },
        {
          id: 'img-2',
          imageUrl: 'https://cdn.example/2.jpg',
          altText: null,
          sortOrder: 1,
          isPrimary: false,
        },
      ],
      branchProducts: [{ priceMinor: 29900, discountMinor: 2000, isAvailable: true }],
      ...overrides,
    };
  }

  it('returns full product details with ordered images and effective price', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: { findFirst: vi.fn().mockResolvedValue(detailRow()) },
    };
    const service = buildService(db);

    const result = await service.getProductDetail('product-1', 'b1');

    expect(result).toMatchObject({
      productId: 'product-1',
      categoryId: 'cat-1',
      effectivePriceMinor: 27900,
      imageUrl: 'https://cdn.example/1.jpg',
    });
    expect(result.images).toHaveLength(2);
    expect(result.images[0].isPrimary).toBe(true);
  });

  it('keeps isAvailable false visible for an unavailable product', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue(
          detailRow({
            branchProducts: [{ priceMinor: 22900, discountMinor: 0, isAvailable: false }],
          }),
        ),
      },
    };
    const service = buildService(db);

    const result = await service.getProductDetail('product-1', 'b1');

    expect(result.isAvailable).toBe(false);
  });

  it('throws NotFoundException when the product is not configured for the branch', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: { findFirst: vi.fn().mockResolvedValue(detailRow({ branchProducts: [] })) },
    };
    const service = buildService(db);

    await expect(service.getProductDetail('product-1', 'b1')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException for a missing product', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = buildService(db);

    await expect(service.getProductDetail('missing', 'b1')).rejects.toThrow(NotFoundException);
  });
});

describe('CatalogService.listCategories', () => {
  it('lists categories without a branch when branchId is omitted', async () => {
    const db = {
      category: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'c1',
            name: 'Starters',
            slug: 'starters',
            description: null,
            imageUrl: null,
            sortOrder: 1,
          },
        ]),
      },
    };
    const service = buildService(db);

    const result = await service.listCategories();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ slug: 'starters', sortOrder: 1 });
    expect(db.category.findMany).toHaveBeenCalledTimes(1);
  });

  it('validates the branch when a branchId is supplied', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      category: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = buildService(db);

    const result = await service.listCategories('b1');

    expect(result).toEqual([]);
    expect(db.branch.findUnique).toHaveBeenCalledWith({
      where: { id: 'b1' },
      select: { id: true, status: true },
    });
  });
});
