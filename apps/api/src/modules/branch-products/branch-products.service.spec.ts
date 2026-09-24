import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchProductsService } from './branch-products.service';

function buildService(db: Record<string, unknown>) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  return new BranchProductsService(prisma);
}

function row() {
  return {
    id: 'bp-1',
    productId: 'product-1',
    priceMinor: 29900,
    discountMinor: 2000,
    isAvailable: true,
    status: 'ACTIVE',
    product: {
      name: 'Special Chicken Biryani',
      slug: 'special-chicken-biryani',
      category: { name: 'Biryani & Rice Meals', slug: 'biryani-and-rice' },
    },
  };
}

describe('BranchProductsService.create', () => {
  it('creates a branch product and computes the effective price', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p1', status: 'ACTIVE' }),
      },
      branchProduct: { create: vi.fn().mockResolvedValue(row()) },
    };
    const service = buildService(db);

    const result = await service.create({
      branchId: 'b1',
      productId: 'p1',
      priceMinor: 29900,
      discountMinor: 2000,
      isAvailable: true,
    });

    expect(result.effectivePriceMinor).toBe(27900);
    expect(db.branchProduct.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ branchId: 'b1', productId: 'p1' }),
      select: expect.any(Object),
    });
  });

  it('rejects an inactive branch', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'PAUSED' }),
      },
      product: { findUnique: vi.fn() },
    };
    const service = buildService(db);

    await expect(
      service.create({ branchId: 'b1', productId: 'p1', priceMinor: 100, discountMinor: 0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a discount larger than the price', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p1', status: 'ACTIVE' }),
      },
    };
    const service = buildService(db);

    await expect(
      service.create({ branchId: 'b1', productId: 'p1', priceMinor: 100, discountMinor: 101 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('maps duplicate configuration to ConflictException', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p1', status: 'ACTIVE' }),
      },
      branchProduct: { create: vi.fn().mockRejectedValue(conflict) },
    };
    const service = buildService(db);

    await expect(
      service.create({ branchId: 'b1', productId: 'p1', priceMinor: 100, discountMinor: 0 }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('BranchProductsService.listForBranch', () => {
  it('lists branch products with a null category handled', async () => {
    const db = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1' }) },
      branchProduct: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { ...row(), product: { name: 'Roll', slug: 'roll', category: null } },
          ]),
      },
    };
    const service = buildService(db);

    const result = await service.listForBranch('b1');

    expect(result[0].product).toMatchObject({ categoryName: null, categorySlug: null });
  });

  it('throws when the branch does not exist', async () => {
    const db = {
      branch: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const service = buildService(db);

    await expect(service.listForBranch('missing')).rejects.toThrow('Branch not found');
  });
});
