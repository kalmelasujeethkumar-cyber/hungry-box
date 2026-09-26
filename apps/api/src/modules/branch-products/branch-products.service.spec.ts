import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BranchProductsService } from './branch-products.service';

const MANAGER = { role: 'BRANCH_MANAGER' as const, branchId: 'b1', userId: 'u-mgr' };

function buildService<T extends Record<string, unknown>>(db: T) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new BranchProductsService(prisma, audit);
  return { service, db, audit };
}

function row(overrides: Record<string, unknown> = {}) {
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
      category: { name: 'Biryani & Rice Meals', slug: 'biryani-and-rice', imageUrl: null },
      images: [],
    },
    images: [],
    ...overrides,
  };
}

describe('BranchProductsService.create', () => {
  it('creates a branch product, computes the effective price, and audits it', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p1', status: 'ACTIVE', name: 'Biryani' }),
      },
      branchProduct: { create: vi.fn().mockResolvedValue(row()) },
    };
    const { service, db: rawDb, audit } = buildService(db);

    const result = await service.create(MANAGER, {
      branchId: 'b1',
      productId: 'p1',
      priceMinor: 29900,
      discountMinor: 2000,
      isAvailable: true,
    });

    expect(result.effectivePriceMinor).toBe(27900);
    expect(rawDb.branchProduct.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ branchId: 'b1', productId: 'p1' }),
      select: expect.any(Object),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'BRANCH_PRODUCT_CREATED', branchId: 'b1' }),
    );
  });

  it('rejects an inactive branch', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'PAUSED' }),
      },
      product: { findUnique: vi.fn() },
    };
    const service = buildService(db).service;

    await expect(
      service.create(MANAGER, {
        branchId: 'b1',
        productId: 'p1',
        priceMinor: 100,
        discountMinor: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a discount larger than the price', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'ACTIVE' }),
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p1', status: 'ACTIVE', name: 'Biryani' }),
      },
    };
    const service = buildService(db).service;

    await expect(
      service.create(MANAGER, {
        branchId: 'b1',
        productId: 'p1',
        priceMinor: 100,
        discountMinor: 101,
      }),
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
        findUnique: vi.fn().mockResolvedValue({ id: 'p1', status: 'ACTIVE', name: 'Biryani' }),
      },
      branchProduct: { create: vi.fn().mockRejectedValue(conflict) },
    };
    const service = buildService(db).service;

    await expect(
      service.create(MANAGER, {
        branchId: 'b1',
        productId: 'p1',
        priceMinor: 100,
        discountMinor: 0,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('forbids a branch manager from configuring another branch', async () => {
    const db = { branch: { findUnique: vi.fn() }, product: { findUnique: vi.fn() } };
    const service = buildService(db).service;

    await expect(
      service.create(MANAGER, { branchId: 'b2', productId: 'p1', priceMinor: 100 }),
    ).rejects.toThrow(ForbiddenException);
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
            row({ product: { name: 'Roll', slug: 'roll', category: null, images: [] } }),
          ]),
      },
    };
    const service = buildService(db).service;

    const result = await service.listForBranch('b1');

    expect(result[0].product).toMatchObject({ categoryName: null, categorySlug: null });
  });

  it('throws when the branch does not exist', async () => {
    const db = {
      branch: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const service = buildService(db).service;

    await expect(service.listForBranch('missing')).rejects.toThrow('Branch not found');
  });
});

describe('BranchProductsService image resolution', () => {
  it('prefers a branch image and exposes both image sets', async () => {
    const db = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1' }) },
      branchProduct: {
        findMany: vi.fn().mockResolvedValue([
          row({
            images: [
              {
                id: 'bi-1',
                imageUrl: 'https://cdn.example/branch.jpg',
                altText: null,
                sortOrder: 0,
                isPrimary: true,
              },
            ],
            product: {
              name: 'Masala Chai',
              slug: 'masala-chai',
              category: {
                name: 'Shakes',
                slug: 'shakes',
                imageUrl: 'https://cdn.example/shakes.jpg',
              },
              images: [
                {
                  id: 'gi-1',
                  imageUrl: 'https://cdn.example/global.jpg',
                  altText: null,
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          }),
        ]),
      },
    };
    const service = buildService(db).service;

    const result = await service.listForBranch('b1');

    expect(result[0].imageUrl).toBe('https://cdn.example/branch.jpg');
    expect(result[0].branchImages).toHaveLength(1);
    expect(result[0].globalImages).toHaveLength(1);
  });

  it('falls back to the global image, then the category image', async () => {
    const withGlobal = buildService({
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1' }) },
      branchProduct: {
        findMany: vi.fn().mockResolvedValue([
          row({
            product: {
              name: 'Masala Chai',
              slug: 'masala-chai',
              category: {
                name: 'Shakes',
                slug: 'shakes',
                imageUrl: 'https://cdn.example/shakes.jpg',
              },
              images: [
                {
                  id: 'gi-1',
                  imageUrl: 'https://cdn.example/global.jpg',
                  altText: null,
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          }),
        ]),
      },
    }).service;
    const withCategory = buildService({
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1' }) },
      branchProduct: {
        findMany: vi.fn().mockResolvedValue([
          row({
            product: {
              name: 'Masala Chai',
              slug: 'masala-chai',
              category: {
                name: 'Shakes',
                slug: 'shakes',
                imageUrl: 'https://cdn.example/shakes.jpg',
              },
              images: [],
            },
          }),
        ]),
      },
    }).service;

    expect((await withGlobal.listForBranch('b1'))[0].imageUrl).toBe(
      'https://cdn.example/global.jpg',
    );
    expect((await withCategory.listForBranch('b1'))[0].imageUrl).toBe(
      'https://cdn.example/shakes.jpg',
    );
  });

  it('never leaks provider storage identifiers to a manager', async () => {
    const db = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1' }) },
      branchProduct: {
        findMany: vi.fn().mockResolvedValue([
          row({
            images: [
              {
                id: 'bi-1',
                imageUrl: 'https://cdn.example/branch.jpg',
                altText: null,
                sortOrder: 0,
                isPrimary: true,
                providerPublicId: 'secret',
                resourceType: 'image',
              },
            ],
          }),
        ]),
      },
    };
    const service = buildService(db).service;

    const result = await service.listForBranch('b1');

    expect(result[0].branchImages[0]).not.toHaveProperty('providerPublicId');
    expect(result[0].branchImages[0]).not.toHaveProperty('resourceType');
  });
});

describe('BranchProductsService.getForActor', () => {
  it('returns a branch product inside the actor scope', async () => {
    const db = {
      branchProduct: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'bp-1', branchId: 'b1' })
          .mockResolvedValueOnce(row()),
      },
    };
    const service = buildService(db).service;

    await expect(service.getForActor(MANAGER, 'bp-1')).resolves.toMatchObject({ id: 'bp-1' });
  });

  it('hides a branch product that belongs to another branch', async () => {
    const db = {
      branchProduct: { findUnique: vi.fn().mockResolvedValue({ id: 'bp-2', branchId: 'b2' }) },
    };
    const service = buildService(db).service;

    await expect(service.getForActor(MANAGER, 'bp-2')).rejects.toThrow(NotFoundException);
  });
});

describe('BranchProductsService.update', () => {
  const existing = {
    id: 'bp-1',
    branchId: 'b1',
    priceMinor: 29900,
    discountMinor: 2000,
    product: { name: 'Special Chicken Biryani' },
  };

  it('updates price and discount and audits the change', async () => {
    const db = {
      branchProduct: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ ...row(), priceMinor: 34900, discountMinor: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(db)),
    };
    const { service, audit } = buildService(db);

    const result = await service.update(MANAGER, 'bp-1', { priceMinor: 34900, discountMinor: 0 });

    expect(result.effectivePriceMinor).toBe(34900);
    expect(db.branchProduct.update).toHaveBeenCalledWith({
      where: { id: 'bp-1' },
      data: expect.objectContaining({ priceMinor: 34900, discountMinor: 0 }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'BRANCH_PRODUCT_UPDATED', branchId: 'b1' }),
      db,
    );
  });

  it('rejects a discount larger than the combined price', async () => {
    const db = {
      branchProduct: { findUnique: vi.fn().mockResolvedValue(existing) },
    };
    const service = buildService(db).service;

    await expect(service.update(MANAGER, 'bp-1', { discountMinor: 50000 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('hides another branch product from a branch manager', async () => {
    const db = {
      branchProduct: {
        findUnique: vi.fn().mockResolvedValue({ ...existing, id: 'bp-2', branchId: 'b2' }),
      },
    };
    const service = buildService(db).service;

    await expect(service.update(MANAGER, 'bp-2', { isAvailable: false })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('BranchProductsService.remove', () => {
  const existing = {
    id: 'bp-1',
    branchId: 'b1',
    product: { name: 'Special Chicken Biryani' },
  };

  it('soft-deactivates a branch product and audits it', async () => {
    const db = {
      branchProduct: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ ...row(), isAvailable: false, status: 'INACTIVE' }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(db)),
    };
    const { service, audit } = buildService(db);

    const result = await service.remove(MANAGER, 'bp-1');

    expect(db.branchProduct.update).toHaveBeenCalledWith({
      where: { id: 'bp-1' },
      data: expect.objectContaining({ status: 'INACTIVE', isAvailable: false }),
    });
    expect(result.status).toBe('INACTIVE');
    expect(result.isAvailable).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'BRANCH_PRODUCT_DEACTIVATED', branchId: 'b1' }),
      db,
    );
  });

  it('hides another branch product from a branch manager', async () => {
    const db = {
      branchProduct: {
        findUnique: vi.fn().mockResolvedValue({ ...existing, id: 'bp-2', branchId: 'b2' }),
      },
    };
    const service = buildService(db).service;

    await expect(service.remove(MANAGER, 'bp-2')).rejects.toThrow(NotFoundException);
  });
});
