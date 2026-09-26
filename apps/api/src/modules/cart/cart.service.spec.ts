import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from './cart.service';

function buildService(db: Record<string, unknown>) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  return new CartService(prisma);
}

function cartWithItems(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cart-1',
    branch: { id: 'b1', name: 'Hungry Box Guntur (Demo)', code: 'guntur', city: 'Guntur' },
    items: [
      {
        id: 'i1',
        quantity: 2,
        unitPriceMinor: 29900,
        unitDiscountMinor: 2000,
        branchProduct: {
          id: 'bp1',
          images: [],
          product: {
            id: 'p1',
            name: 'Special Chicken Biryani',
            slug: 'special-chicken-biryani',
            category: { name: 'Biryani & Rice Meals', imageUrl: null },
            images: [],
          },
        },
      },
      {
        id: 'i2',
        quantity: 1,
        unitPriceMinor: 12900,
        unitDiscountMinor: 500,
        branchProduct: {
          id: 'bp2',
          images: [],
          product: {
            id: 'p2',
            name: 'Chicken 65 Roll',
            slug: 'chicken-65-roll',
            category: null,
            images: [],
          },
        },
      },
    ],
    ...overrides,
  };
}

function baseDb() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cust-1', status: 'ACTIVE' }),
    },
    branch: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'b1',
        name: 'Hungry Box Guntur (Demo)',
        code: 'guntur',
        city: 'Guntur',
        status: 'ACTIVE',
      }),
    },
    branchProduct: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'bp1',
        priceMinor: 29900,
        discountMinor: 2000,
        status: 'ACTIVE',
        isAvailable: true,
        product: { status: 'ACTIVE' },
      }),
    },
    cart: {
      upsert: vi.fn().mockResolvedValue({ id: 'cart-1' }),
      findUnique: vi.fn().mockResolvedValue(cartWithItems()),
      delete: vi.fn().mockResolvedValue({ id: 'cart-1' }),
    },
    cartItem: {
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({ id: 'i1', cart: { branchId: 'b1' } }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('CartService.get', () => {
  it('computes totals server-side from stored snapshots', async () => {
    const db = baseDb();
    const service = buildService(db);

    const result = await service.get('cust-1', 'b1');

    expect(result).toMatchObject({
      id: 'cart-1',
      branch: { code: 'guntur' },
      subtotalMinor: 2 * 29900 + 12900,
      discountMinor: 2 * 2000 + 500,
      totalMinor: 2 * 29900 + 12900 - (2 * 2000 + 500),
      itemCount: 3,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      unitEffectivePriceMinor: 27900,
      lineTotalMinor: 55800,
    });
  });

  it('returns an empty summary when no cart exists', async () => {
    const db = baseDb();
    db.cart.findUnique = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    const result = await service.get('cust-1', 'b1');

    expect(result).toMatchObject({
      id: null,
      items: [],
      subtotalMinor: 0,
      discountMinor: 0,
      totalMinor: 0,
      itemCount: 0,
    });
    expect(result.branch.name).toBe('Hungry Box Guntur (Demo)');
  });

  it('shows the branch image on the cart line, matching the catalogue', async () => {
    const db = baseDb();
    db.cart.findUnique = vi.fn().mockResolvedValue(
      cartWithItems({
        items: [
          {
            id: 'i1',
            quantity: 1,
            unitPriceMinor: 29900,
            unitDiscountMinor: 0,
            branchProduct: {
              id: 'bp1',
              images: [
                {
                  imageUrl: 'https://cdn.test/branch-primary.jpg',
                  isPrimary: true,
                  sortOrder: 0,
                },
              ],
              product: {
                id: 'p1',
                name: 'Special Chicken Biryani',
                slug: 'special-chicken-biryani',
                category: { name: 'Biryani', imageUrl: 'https://cdn.test/category.jpg' },
                images: [
                  {
                    imageUrl: 'https://cdn.test/global-primary.jpg',
                    isPrimary: true,
                    sortOrder: 0,
                  },
                ],
              },
            },
          },
        ],
      }),
    );
    const service = buildService(db);

    const result = await service.get('cust-1', 'b1');

    expect(result.items[0].imageUrl).toBe('https://cdn.test/branch-primary.jpg');
  });

  it('falls back through global then category images when a branch has none', async () => {
    const db = baseDb();
    db.cart.findUnique = vi.fn().mockResolvedValue(
      cartWithItems({
        items: [
          {
            id: 'i1',
            quantity: 1,
            unitPriceMinor: 29900,
            unitDiscountMinor: 0,
            branchProduct: {
              id: 'bp1',
              images: [],
              product: {
                id: 'p1',
                name: 'Special Chicken Biryani',
                slug: 'special-chicken-biryani',
                category: { name: 'Biryani', imageUrl: 'https://cdn.test/category.jpg' },
                images: [
                  { imageUrl: 'https://cdn.test/global-1.jpg', isPrimary: false, sortOrder: 0 },
                  { imageUrl: 'https://cdn.test/global-2.jpg', isPrimary: true, sortOrder: 1 },
                ],
              },
            },
          },
        ],
      }),
    );
    const service = buildService(db);
    const withGlobal = await service.get('cust-1', 'b1');
    expect(withGlobal.items[0].imageUrl).toBe('https://cdn.test/global-2.jpg');

    db.cart.findUnique = vi.fn().mockResolvedValue(
      cartWithItems({
        items: [
          {
            id: 'i1',
            quantity: 1,
            unitPriceMinor: 29900,
            unitDiscountMinor: 0,
            branchProduct: {
              id: 'bp1',
              images: [],
              product: {
                id: 'p1',
                name: 'Special Chicken Biryani',
                slug: 'special-chicken-biryani',
                category: { name: 'Biryani', imageUrl: 'https://cdn.test/category.jpg' },
                images: [],
              },
            },
          },
        ],
      }),
    );
    const withCategory = await service.get('cust-1', 'b1');
    expect(withCategory.items[0].imageUrl).toBe('https://cdn.test/category.jpg');
  });

  it('rejects an inactive branch', async () => {
    const db = baseDb();
    db.branch.findUnique = vi.fn().mockResolvedValue({
      id: 'b1',
      name: 'Hungry Box Guntur (Demo)',
      code: 'guntur',
      city: 'Guntur',
      status: 'INACTIVE',
    });
    const service = buildService(db);

    await expect(service.get('cust-1', 'b1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a suspended customer', async () => {
    const db = baseDb();
    db.user.findUnique = vi.fn().mockResolvedValue({ id: 'cust-1', status: 'SUSPENDED' });
    const service = buildService(db);

    await expect(service.get('cust-1', 'b1')).rejects.toThrow(UnauthorizedException);
  });
});

describe('CartService.addItem', () => {
  it('creates a cart and stores the server price snapshot', async () => {
    const db = baseDb();
    const service = buildService(db);

    await service.addItem('cust-1', { branchId: 'b1', productId: 'p1', quantity: 1 });

    expect(db.cart.upsert).toHaveBeenCalledWith({
      where: { customerId_branchId: { customerId: 'cust-1', branchId: 'b1' } },
      update: {},
      create: { customerId: 'cust-1', branchId: 'b1' },
      select: { id: true },
    });
    expect(db.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          quantity: 1,
          unitPriceMinor: 29900,
          unitDiscountMinor: 2000,
        }),
      }),
    );
    expect(db.cartItem.upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        create: expect.objectContaining({ unitPriceMinor: 1 }),
      }),
    );
  });

  it('increments the quantity when the item is already in the cart', async () => {
    const db = baseDb();
    const service = buildService(db);

    await service.addItem('cust-1', { branchId: 'b1', productId: 'p1', quantity: 3 });

    expect(db.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ quantity: { increment: 3 } }),
      }),
    );
  });

  it('refreshes the price snapshot from the branch product on each add', async () => {
    const db = baseDb();
    const service = buildService(db);

    await service.addItem('cust-1', { branchId: 'b1', productId: 'p1', quantity: 1 });

    expect(db.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ unitPriceMinor: 29900, unitDiscountMinor: 2000 }),
      }),
    );
  });

  it('rejects an unavailable product', async () => {
    const db = baseDb();
    db.branchProduct.findFirst = vi.fn().mockResolvedValue({
      id: 'bp1',
      priceMinor: 22900,
      discountMinor: 0,
      status: 'ACTIVE',
      isAvailable: false,
      product: { status: 'ACTIVE' },
    });
    const service = buildService(db);

    await expect(
      service.addItem('cust-1', { branchId: 'b1', productId: 'p1', quantity: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a product not sold at the branch', async () => {
    const db = baseDb();
    db.branchProduct.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(
      service.addItem('cust-1', { branchId: 'b1', productId: 'missing', quantity: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive product', async () => {
    const db = baseDb();
    db.branchProduct.findFirst = vi.fn().mockResolvedValue({
      id: 'bp1',
      priceMinor: 29900,
      discountMinor: 0,
      status: 'ACTIVE',
      isAvailable: true,
      product: { status: 'INACTIVE' },
    });
    const service = buildService(db);

    await expect(
      service.addItem('cust-1', { branchId: 'b1', productId: 'p1', quantity: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive branch configuration', async () => {
    const db = baseDb();
    db.branchProduct.findFirst = vi.fn().mockResolvedValue({
      id: 'bp1',
      priceMinor: 29900,
      discountMinor: 0,
      status: 'INACTIVE',
      isAvailable: true,
      product: { status: 'ACTIVE' },
    });
    const service = buildService(db);

    await expect(
      service.addItem('cust-1', { branchId: 'b1', productId: 'p1', quantity: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive branch', async () => {
    const db = baseDb();
    db.branch.findUnique = vi.fn().mockResolvedValue({
      id: 'b1',
      name: 'Hungry Box Guntur (Demo)',
      code: 'guntur',
      city: 'Guntur',
      status: 'PAUSED',
    });
    const service = buildService(db);

    await expect(
      service.addItem('cust-1', { branchId: 'b1', productId: 'p1', quantity: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps carts branch-specific so branches never mix', async () => {
    const db = baseDb();
    const service = buildService(db);

    await service.addItem('cust-1', { branchId: 'b1', productId: 'p1', quantity: 1 });
    await service.addItem('cust-1', { branchId: 'b2', productId: 'p1', quantity: 1 });

    expect(db.cart.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId_branchId: { customerId: 'cust-1', branchId: 'b1' } },
      }),
    );
    expect(db.cart.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId_branchId: { customerId: 'cust-1', branchId: 'b2' } },
      }),
    );
  });
});

describe('CartService.updateItem', () => {
  it('sets the absolute quantity for an owned item', async () => {
    const db = baseDb();
    const service = buildService(db);

    await service.updateItem('cust-1', 'i1', { quantity: 5 });

    expect(db.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { quantity: 5 },
    });
  });

  it('rejects an item that belongs to another customer', async () => {
    const db = baseDb();
    db.cartItem.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(service.updateItem('cust-1', 'i-other', { quantity: 2 })).rejects.toThrow(
      NotFoundException,
    );
    expect(db.cartItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'i-other', cart: { customerId: 'cust-1' } },
      select: expect.any(Object),
    });
  });
});

describe('CartService.removeItem', () => {
  it('removes an owned item and returns the updated summary', async () => {
    const db = baseDb();
    const service = buildService(db);

    const result = await service.removeItem('cust-1', 'i1');

    expect(db.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    expect(result.items).toHaveLength(2);
  });

  it('rejects an item that belongs to another customer', async () => {
    const db = baseDb();
    db.cartItem.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(service.removeItem('cust-1', 'i-other')).rejects.toThrow(NotFoundException);
  });
});

describe('CartService.clear', () => {
  it('deletes the branch cart and returns an empty summary', async () => {
    const db = baseDb();
    db.cart.findUnique = vi.fn().mockResolvedValue({ id: 'cart-1' });
    const service = buildService(db);

    const result = await service.clear('cust-1', 'b1');

    expect(db.cart.delete).toHaveBeenCalledWith({ where: { id: 'cart-1' } });
    expect(result.items).toEqual([]);
    expect(result.totalMinor).toBe(0);
  });

  it('is a no-op when no cart exists', async () => {
    const db = baseDb();
    db.cart.findUnique = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    const result = await service.clear('cust-1', 'b1');

    expect(db.cart.delete).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
  });
});
