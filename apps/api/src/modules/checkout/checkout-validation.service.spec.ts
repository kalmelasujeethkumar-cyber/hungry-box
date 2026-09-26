import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { DefaultDeliveryFeePolicy } from './delivery-fee.policy';
import { CheckoutValidationService } from './checkout-validation.service';

function baseDb() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cust-1', status: 'ACTIVE' }),
    },
    cart: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'cart-1',
        branchId: 'b1',
        items: [
          {
            branchProductId: 'bp1',
            quantity: 2,
            unitPriceMinor: 29900,
            unitDiscountMinor: 2000,
          },
          { branchProductId: 'bp2', quantity: 1, unitPriceMinor: 12000, unitDiscountMinor: 0 },
        ],
      }),
    },
    branch: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'b1',
        name: 'Hungry Box Guntur (Demo)',
        code: 'guntur',
        city: 'Guntur',
        status: 'ACTIVE',
        latitude: 16.3067,
        longitude: 80.4365,
        deliveryRadiusKm: 10,
      }),
    },
    address: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'a1',
        customerId: 'cust-1',
        label: 'Home',
        recipientName: 'Demo Customer',
        phone: '9090909090',
        houseFlat: '1-2',
        streetArea: 'Main Road',
        landmark: 'Bus Stop',
        city: 'Guntur',
        state: 'Andhra Pradesh',
        postalCode: '522001',
        latitude: 16.3067,
        longitude: 80.4365,
        deliveryInstructions: null,
      }),
    },
    branchProduct: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'bp1',
          priceMinor: 29900,
          discountMinor: 2000,
          isAvailable: true,
          status: 'ACTIVE',
          images: [],
          product: {
            id: 'p1',
            name: 'Special Chicken Biryani',
            status: 'ACTIVE',
            category: { name: 'Biryani & Rice Meals', imageUrl: null },
            images: [
              {
                imageUrl: 'https://img.hungrybox.test/biryani.jpg',
                isPrimary: true,
                sortOrder: 0,
              },
            ],
          },
        },
        {
          id: 'bp2',
          priceMinor: 12000,
          discountMinor: 0,
          isAvailable: true,
          status: 'ACTIVE',
          images: [],
          product: {
            id: 'p2',
            name: 'Chicken 65 Roll',
            status: 'ACTIVE',
            category: null,
            images: [],
          },
        },
      ]),
    },
  };
}

function buildService(db: Record<string, unknown>) {
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const config = {
    get: vi.fn((_key: string, fallback?: unknown) => fallback),
  } as unknown as ConfigService;
  const feePolicy = new DefaultDeliveryFeePolicy(config);
  return new CheckoutValidationService(prisma, feePolicy, config);
}

describe('CheckoutValidationService.resolve', () => {
  it('recomputes totals from branch product rows and never trusts the client', async () => {
    const db = baseDb();
    const service = buildService(db);

    const result = await service.resolve('cust-1', 'a1');

    expect(result.serviceable).toBe(true);
    expect(result.distanceKm).toBe(0);
    expect(result.subtotalMinor).toBe(2 * 29900 + 12000);
    expect(result.discountMinor).toBe(2 * 2000);
    expect(result.deliveryFeeMinor).toBe(3000);
    expect(result.taxMinor).toBe(0);
    expect(result.totalMinor).toBe(2 * 29900 + 12000 - 2 * 2000 + 3000);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      productName: 'Special Chicken Biryani',
      unitEffectivePriceMinor: 27900,
      lineTotalMinor: 55800,
    });
    expect(result.unavailableItems).toEqual([]);
    expect(result.priceChanges).toEqual([]);
  });

  it('carries the branch image on the checkout line when the branch has one', async () => {
    const db = baseDb();
    db.branchProduct.findMany = vi.fn().mockResolvedValue([
      {
        id: 'bp1',
        priceMinor: 29900,
        discountMinor: 0,
        isAvailable: true,
        status: 'ACTIVE',
        images: [
          {
            imageUrl: 'https://img.hungrybox.test/branch/biryani.jpg',
            isPrimary: true,
            sortOrder: 0,
          },
        ],
        product: {
          id: 'p1',
          name: 'Special Chicken Biryani',
          status: 'ACTIVE',
          category: { name: 'Biryani & Rice Meals', imageUrl: null },
          images: [
            {
              imageUrl: 'https://img.hungrybox.test/biryani.jpg',
              isPrimary: true,
              sortOrder: 0,
            },
          ],
        },
      },
    ]);
    db.cart.findFirst = vi.fn().mockResolvedValue({
      id: 'cart-1',
      branchId: 'b1',
      items: [{ branchProductId: 'bp1', quantity: 1, unitPriceMinor: 29900, unitDiscountMinor: 0 }],
    });
    const service = buildService(db);

    const result = await service.resolve('cust-1', 'a1');

    expect(result.items[0].imageUrl).toBe('https://img.hungrybox.test/branch/biryani.jpg');
  });

  it('detects a price change relative to the cart snapshot', async () => {
    const db = baseDb();
    db.cart.findFirst = vi.fn().mockResolvedValue({
      id: 'cart-1',
      branchId: 'b1',
      items: [{ branchProductId: 'bp1', quantity: 1, unitPriceMinor: 25900, unitDiscountMinor: 0 }],
    });
    const service = buildService(db);

    const result = await service.resolve('cust-1', 'a1');

    expect(result.priceChanges).toEqual([
      expect.objectContaining({
        productId: 'p1',
        fromUnitPriceMinor: 25900,
        toUnitPriceMinor: 29900,
      }),
    ]);
  });

  it('flags unavailable items with a reason and keeps their quantity in itemCount', async () => {
    const db = baseDb();
    db.branchProduct.findMany = vi.fn().mockResolvedValue([
      {
        id: 'bp1',
        priceMinor: 29900,
        discountMinor: 2000,
        isAvailable: false,
        status: 'ACTIVE',
        images: [],
        product: {
          id: 'p1',
          name: 'Special Chicken Biryani',
          status: 'ACTIVE',
          category: null,
          images: [],
        },
      },
      {
        id: 'bp2',
        priceMinor: 12000,
        discountMinor: 0,
        isAvailable: true,
        status: 'INACTIVE',
        images: [],
        product: {
          id: 'p2',
          name: 'Chicken 65 Roll',
          status: 'ACTIVE',
          category: null,
          images: [],
        },
      },
    ]);
    const service = buildService(db);

    const result = await service.resolve('cust-1', 'a1');

    expect(result.unavailableItems).toHaveLength(2);
    expect(result.unavailableItems[0]).toMatchObject({
      productName: 'Special Chicken Biryani',
      reason: 'Out of stock',
    });
    expect(result.unavailableItems[1]).toMatchObject({
      productName: 'Chicken 65 Roll',
      reason: 'Product listing is inactive',
    });
    expect(result.items).toEqual([]);
    expect(result.itemCount).toBe(3);
  });

  it('labels an out-of-stock product specifically', async () => {
    const db = baseDb();
    db.branchProduct.findMany = vi.fn().mockResolvedValue([
      {
        id: 'bp1',
        priceMinor: 29900,
        discountMinor: 2000,
        isAvailable: false,
        status: 'ACTIVE',
        images: [],
        product: {
          id: 'p1',
          name: 'Special Chicken Biryani',
          status: 'ACTIVE',
          category: null,
          images: [],
        },
      },
    ]);
    const service = buildService(db);

    const result = await service.resolve('cust-1', 'a1');

    expect(result.unavailableItems[0]).toMatchObject({ reason: 'Out of stock' });
  });

  it('marks the checkout unserviceable when the delivery radius is exceeded', async () => {
    const db = baseDb();
    db.branch.findUnique = vi.fn().mockResolvedValue({
      id: 'b1',
      name: 'Hungry Box Guntur (Demo)',
      code: 'guntur',
      city: 'Guntur',
      status: 'ACTIVE',
      latitude: 16.3067,
      longitude: 80.4365,
      deliveryRadiusKm: 1,
    });
    db.address.findFirst = vi.fn().mockResolvedValue({
      id: 'a1',
      customerId: 'cust-1',
      label: 'Home',
      recipientName: 'Demo Customer',
      phone: '9090909090',
      houseFlat: '1-2',
      streetArea: 'Main Road',
      landmark: 'Bus Stop',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      postalCode: '520001',
      latitude: 16.5062,
      longitude: 80.648,
      deliveryInstructions: null,
    });
    const service = buildService(db);

    const result = await service.resolve('cust-1', 'a1');

    expect(result.serviceable).toBe(false);
    expect(result.distanceKm).toBeGreaterThan(10);
  });

  it('rejects an empty cart', async () => {
    const db = baseDb();
    db.cart.findFirst = vi.fn().mockResolvedValue({ id: 'cart-1', branchId: 'b1', items: [] });
    const service = buildService(db);

    await expect(service.resolve('cust-1', 'a1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a paused branch', async () => {
    const db = baseDb();
    db.branch.findUnique = vi.fn().mockResolvedValue({
      id: 'b1',
      name: 'Hungry Box Guntur (Demo)',
      code: 'guntur',
      city: 'Guntur',
      status: 'PAUSED',
      latitude: 16.3067,
      longitude: 80.4365,
      deliveryRadiusKm: 10,
    });
    const service = buildService(db);

    await expect(service.resolve('cust-1', 'a1')).rejects.toThrow(BadRequestException);
  });

  it('rejects an address that belongs to another customer', async () => {
    const db = baseDb();
    db.address.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(service.resolve('cust-1', 'a-other')).rejects.toThrow(NotFoundException);
  });

  it('rejects a suspended customer', async () => {
    const db = baseDb();
    db.user.findUnique = vi.fn().mockResolvedValue({ id: 'cust-1', status: 'SUSPENDED' });
    const service = buildService(db);

    await expect(service.resolve('cust-1', 'a1')).rejects.toThrow(UnauthorizedException);
  });
});
