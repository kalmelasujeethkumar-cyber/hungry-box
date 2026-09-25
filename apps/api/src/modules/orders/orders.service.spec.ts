import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ValidatedCheckout } from '../checkout/checkout-validation.service';
import { CheckoutConflictException } from '../../common/exceptions/checkout-conflict.exception';
import { PaymentNotVerifiedException } from '../payments/payment-not-verified.exception';
import { OrderStateService } from './order-state.service';
import { OrdersService } from './orders.service';

function validated(overrides: Partial<ValidatedCheckout> = {}): ValidatedCheckout {
  return {
    branchId: 'b1',
    branch: { id: 'b1', name: 'Hungry Box Guntur (Demo)', code: 'guntur', city: 'Guntur' },
    address: {
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
    },
    serviceable: true,
    distanceKm: 0,
    items: [
      {
        branchProductId: 'bp1',
        productId: 'p1',
        productName: 'Special Chicken Biryani',
        categoryName: 'Biryani & Rice Meals',
        imageUrl: null,
        quantity: 2,
        unitPriceMinor: 29900,
        unitDiscountMinor: 2000,
        unitEffectivePriceMinor: 27900,
        lineSubtotalMinor: 59800,
        lineDiscountMinor: 4000,
        lineTotalMinor: 55800,
      },
    ],
    unavailableItems: [],
    priceChanges: [],
    subtotalMinor: 59800,
    discountMinor: 4000,
    deliveryFeeMinor: 3000,
    taxMinor: 0,
    totalMinor: 70800,
    itemCount: 2,
    ...overrides,
  } as ValidatedCheckout;
}

function orderDetailSource(status = 'PLACED') {
  return {
    id: 'o1',
    orderNumber: 'HB-20260925-000001',
    status,
    paymentStatus: 'PAID',
    branch: { id: 'b1', name: 'Hungry Box Guntur (Demo)', code: 'guntur', city: 'Guntur' },
    items: [
      {
        id: 'oi1',
        productId: 'p1',
        productName: 'Special Chicken Biryani',
        quantity: 2,
        unitPriceMinor: 29900,
        unitDiscountMinor: 2000,
        lineSubtotalMinor: 59800,
        lineDiscountMinor: 4000,
        lineTotalMinor: 55800,
      },
    ],
    address: {
      id: 'oa1',
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
    },
    payments: [
      {
        id: 'pay-1',
        provider: 'dev',
        providerPaymentId: 'dev_x',
        providerOrderId: null,
        method: 'UPI',
        status: 'PAID',
        amountMinor: 70800,
        currency: 'INR',
      },
    ],
    events: [
      {
        id: 'ev1',
        kind: 'ORDER_CREATED',
        fromStatus: null,
        toStatus: 'PLACED',
        actorRole: 'CUSTOMER',
        createdAt: new Date('2026-09-25T10:00:00.000Z'),
      },
    ],
    subtotalMinor: 59800,
    discountMinor: 4000,
    deliveryFeeMinor: 3000,
    taxMinor: 0,
    totalMinor: 70800,
    placedAt: new Date('2026-09-25T10:00:00.000Z'),
    cancelledAt: null,
  };
}

function orderSummarySource() {
  return {
    id: 'o1',
    orderNumber: 'HB-20260925-000001',
    status: 'PLACED',
    paymentStatus: 'PAID',
    branch: { id: 'b1', name: 'Hungry Box Guntur (Demo)', code: 'guntur', city: 'Guntur' },
    items: [{ quantity: 2 }],
    subtotalMinor: 59800,
    discountMinor: 4000,
    deliveryFeeMinor: 3000,
    taxMinor: 0,
    totalMinor: 70800,
    placedAt: new Date('2026-09-25T10:00:00.000Z'),
    cancelledAt: null,
  };
}

function baseDb() {
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cust-1', status: 'ACTIVE' }),
    },
    idempotencyKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    order: {
      findFirst: vi
        .fn()
        .mockImplementation(async ({ select }: { select: Record<string, unknown> }) => {
          if (select && 'events' in select) {
            return orderDetailSource();
          }
          return { id: 'o1', status: 'PLACED' };
        }),
      findMany: vi.fn().mockResolvedValue([orderSummarySource()]),
      create: vi.fn().mockResolvedValue({ id: 'o1' }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    orderEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    payment: {
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({
        id: 'pay-cod-1',
        provider: 'cod',
        providerPaymentId: 'cod_x',
        amountMinor: 70800,
        currency: 'INR',
        method: 'COD',
        status: 'PENDING',
      }),
    },
    orderNumberCounter: {
      upsert: vi.fn().mockResolvedValue({ date: '20260925', seq: 1 }),
    },
    cart: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: ((): unknown => undefined) as unknown,
  };
  db.$transaction = vi
    .fn()
    .mockImplementation(async (callback: (tx: unknown) => unknown) => callback(db));
  return db;
}

function buildService<T extends Record<string, unknown> = ReturnType<typeof baseDb>>(
  opts: {
    db?: T;
    resolve?: () => Promise<ValidatedCheckout>;
    requireFinalVerification?: ReturnType<typeof vi.fn>;
    createCodPayment?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const db = (opts.db ?? baseDb()) as T;
  const prisma = { requireClient: vi.fn().mockReturnValue(db) };
  const checkoutValidation = { resolve: opts.resolve ?? vi.fn().mockResolvedValue(validated()) };
  const paymentProviders = {
    current: vi.fn().mockResolvedValue({ id: 'dev', supportedMethods: ['UPI'] }),
  };
  const payments = {
    requireFinalVerification:
      opts.requireFinalVerification ??
      vi.fn().mockResolvedValue({
        payment: { id: 'pay-1', providerPaymentId: 'dev_x', amountMinor: 70800 },
        paidAt: new Date('2026-09-25T10:05:00.000Z'),
      }),
    createCodPayment:
      opts.createCodPayment ??
      vi.fn().mockImplementation(
        async (
          customerId: string,
          amountMinor: number,
          client?: {
            payment: { create: (args: Record<string, unknown>) => Promise<{ id: string }> };
          },
        ) => {
          const payment = await client?.payment.create({
            data: {
              customerId,
              provider: 'cod',
              providerPaymentId: 'cod_x',
              amountMinor,
              currency: 'INR',
              method: 'COD',
              status: 'PENDING',
            },
          });
          const created = payment as unknown as { id: string };
          return {
            paymentId: created.id,
            provider: 'cod',
            providerPaymentId: 'cod_x',
            providerOrderId: null,
            amountMinor,
            currency: 'INR',
            method: 'COD',
            status: 'PENDING',
          };
        },
      ),
  };
  const orderNumbers = { next: vi.fn().mockResolvedValue('HB-20260925-000001') };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new OrdersService(
      prisma as never,
      checkoutValidation as never,
      paymentProviders as never,
      payments as never,
      orderNumbers as never,
      new OrderStateService(),
      audit as never,
    ),
    db,
    payments,
    orderNumbers,
    checkoutValidation,
    audit,
  };
}

describe('OrdersService.create', () => {
  it('returns an earlier order when the idempotency key was already used', async () => {
    const { service, db, payments, orderNumbers, audit } = buildService({
      db: {
        ...baseDb(),
        idempotencyKey: {
          findUnique: vi.fn().mockResolvedValue({ key: 'ik', customerId: 'cust-1', orderId: 'o1' }),
          create: vi.fn().mockResolvedValue({}),
        },
      },
    });

    const result = await service.create('cust-1', {
      paymentId: 'pay-1',
      idempotencyKey: 'ik',
      addressId: 'a1',
    });

    expect(result.id).toBe('o1');
    expect(payments.requireFinalVerification).not.toHaveBeenCalled();
    expect(orderNumbers.next).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'IDEMPOTENCY_REPLAY' }),
    );
  });

  it('rejects an idempotency key claimed by another customer', async () => {
    const { service } = buildService({
      db: {
        ...baseDb(),
        idempotencyKey: {
          findUnique: vi.fn().mockResolvedValue({ key: 'ik', customerId: 'cust-2', orderId: 'o9' }),
          create: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await expect(
      service.create('cust-1', { paymentId: 'pay-1', idempotencyKey: 'ik', addressId: 'a1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('verifies the payment on the server before creating anything', async () => {
    const { service, payments } = buildService({});

    await service.create('cust-1', { paymentId: 'pay-1', idempotencyKey: 'ik', addressId: 'a1' });

    expect(payments.requireFinalVerification).toHaveBeenCalledWith('pay-1', 'cust-1');
  });

  it('creates the order with immutable snapshots, PAID payment and clears the cart', async () => {
    const { service, db, audit } = buildService({});

    const result = await service.create('cust-1', {
      paymentId: 'pay-1',
      idempotencyKey: 'ik',
      addressId: 'a1',
      notes: 'Extra raita',
    });

    expect(result.id).toBe('o1');
    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderNumber: 'HB-20260925-000001',
          status: 'PLACED',
          paymentStatus: 'PAID',
          totalMinor: 70800,
          notes: 'Extra raita',
          items: {
            create: [
              expect.objectContaining({
                productId: 'p1',
                productName: 'Special Chicken Biryani',
                quantity: 2,
                unitPriceMinor: 29900,
                unitDiscountMinor: 2000,
                lineTotalMinor: 55800,
              }),
            ],
          },
          address: {
            create: expect.objectContaining({
              recipientName: 'Demo Customer',
              city: 'Guntur',
              postalCode: '522001',
            }),
          },
        }),
      }),
    );
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({ status: 'PAID', orderId: 'o1' }),
      }),
    );
    expect(db.idempotencyKey.create).toHaveBeenCalledWith({
      data: { key: 'ik', customerId: 'cust-1', orderId: 'o1' },
    });
    expect(db.cart.deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', branchId: 'b1' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ORDER_CREATED', entityId: 'o1' }),
    );
  });

  it('re-validates again inside the transaction and rejects a drifted amount', async () => {
    const { service, db } = buildService({
      requireFinalVerification: vi.fn().mockResolvedValue({
        payment: { id: 'pay-1', providerPaymentId: 'dev_x', amountMinor: 70000 },
        paidAt: new Date(),
      }),
    });

    const error = await service
      .create('cust-1', { paymentId: 'pay-1', idempotencyKey: 'ik', addressId: 'a1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckoutConflictException);
    expect((error as CheckoutConflictException).code).toBe('checkout.prices_changed');
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.cart.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an unserviceable delivery even if the payment was already made', async () => {
    const { service, db } = buildService({
      resolve: vi.fn().mockResolvedValue(validated({ serviceable: false })),
    });

    const error = await service
      .create('cust-1', { paymentId: 'pay-1', idempotencyKey: 'ik', addressId: 'a1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckoutConflictException);
    expect((error as CheckoutConflictException).code).toBe('checkout.unserviceable');
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('rejects unavailable items at finalization', async () => {
    const { service, db } = buildService({
      resolve: vi.fn().mockResolvedValue(
        validated({
          unavailableItems: [
            { productId: 'p2', productName: 'Chicken 65 Roll', reason: 'Out of stock' },
          ],
        }),
      ),
    });

    const error = await service
      .create('cust-1', { paymentId: 'pay-1', idempotencyKey: 'ik', addressId: 'a1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckoutConflictException);
    expect((error as CheckoutConflictException).code).toBe('checkout.unavailable');
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('recovers a completed order when a concurrent request wins the race', async () => {
    const failingDb = baseDb();
    (failingDb.idempotencyKey as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ key: 'ik', customerId: 'cust-1', orderId: 'o1' });
    failingDb.$transaction = vi.fn().mockRejectedValue(new Error('unique constraint'));
    const { service, audit } = buildService({ db: failingDb });

    const result = await service.create('cust-1', {
      paymentId: 'pay-1',
      idempotencyKey: 'ik',
      addressId: 'a1',
    });

    expect(result.id).toBe('o1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'IDEMPOTENCY_REPLAY' }),
    );
  });

  it('propagates a payment that could not be verified', async () => {
    const { service, db } = buildService({
      requireFinalVerification: vi
        .fn()
        .mockRejectedValue(
          new PaymentNotVerifiedException('FAILED', 'Developer simulated failure'),
        ),
    });

    await expect(
      service.create('cust-1', { paymentId: 'pay-1', idempotencyKey: 'ik', addressId: 'a1' }),
    ).rejects.toThrow(PaymentNotVerifiedException);
    expect(db.order.create).not.toHaveBeenCalled();
  });
});

describe('OrdersService.createCod', () => {
  it('places a COD order with a PENDING payment and server-computed totals', async () => {
    const { service, db, payments, audit } = buildService({});

    const result = await service.createCod('cust-1', {
      idempotencyKey: 'cod-ik-1',
      addressId: 'a1',
      notes: 'Keep in bag',
    });

    expect(result.id).toBe('o1');
    expect(db.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'cod',
          method: 'COD',
          status: 'PENDING',
          amountMinor: 70800,
        }),
      }),
    );
    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'PENDING',
          totalMinor: 70800,
          notes: 'Keep in bag',
        }),
      }),
    );
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-cod-1' },
        data: expect.objectContaining({ orderId: 'o1' }),
      }),
    );
    expect(db.idempotencyKey.create).toHaveBeenCalledWith({
      data: { key: 'cod-ik-1', customerId: 'cust-1', orderId: 'o1' },
    });
    expect(db.cart.deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', branchId: 'b1' },
    });
    expect(payments.createCodPayment).toHaveBeenCalledWith('cust-1', 70800, expect.anything());
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'COD_ORDER_CREATED', entityId: 'o1', branchId: 'b1' }),
    );
  });

  it('never verifies a gateway payment or touches the provider for COD', async () => {
    const { service, payments } = buildService({});

    await service.createCod('cust-1', { idempotencyKey: 'cod-ik-1', addressId: 'a1' });

    expect(payments.requireFinalVerification).not.toHaveBeenCalled();
  });

  it('applies the same checkout conflicts as paid orders', async () => {
    const { service, db } = buildService({
      resolve: vi.fn().mockResolvedValue(validated({ serviceable: false })),
    });

    const error = await service
      .createCod('cust-1', { idempotencyKey: 'cod-ik-1', addressId: 'a1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckoutConflictException);
    expect((error as CheckoutConflictException).code).toBe('checkout.unserviceable');
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('replays an existing COD order for a reused idempotency key', async () => {
    const { service, db, payments } = buildService({
      db: {
        ...baseDb(),
        idempotencyKey: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ key: 'cod-ik-1', customerId: 'cust-1', orderId: 'o1' }),
          create: vi.fn().mockResolvedValue({}),
        },
      },
    });

    const result = await service.createCod('cust-1', {
      idempotencyKey: 'cod-ik-1',
      addressId: 'a1',
    });

    expect(result.id).toBe('o1');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(payments.createCodPayment).not.toHaveBeenCalled();
  });
});

describe('OrdersService.cancelMine', () => {
  it('cancels an order the customer is allowed to cancel', async () => {
    const { service, db, audit } = buildService({});

    const result = await service.cancelMine('cust-1', 'o1', { reason: 'Changed my mind' });

    expect(result.id).toBe('o1');
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledByRole: 'CUSTOMER',
          cancellationReason: 'Changed my mind',
        }),
      }),
    );
    expect(db.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'ORDER_CANCELLED', toStatus: 'CANCELLED' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ORDER_CANCELLED' }));
  });

  it('refuses to cancel a delivered order', async () => {
    const db = baseDb();
    (db.order as { findFirst: ReturnType<typeof vi.fn> }).findFirst = vi
      .fn()
      .mockImplementation(async ({ select }: { select: Record<string, unknown> }) => {
        if (select && 'events' in select) {
          return orderDetailSource('DELIVERED');
        }
        return { id: 'o1', status: 'DELIVERED' };
      });
    const { service, db: sameDb } = buildService({ db });

    const error = await service.cancelMine('cust-1', 'o1', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((sameDb.order as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
  });

  it('does not reveal another customer order', async () => {
    const db = baseDb();
    (db.order as { findFirst: ReturnType<typeof vi.fn> }).findFirst = vi
      .fn()
      .mockResolvedValue(null);
    const { service } = buildService({ db });

    await expect(service.cancelMine('cust-1', 'o-other', {})).rejects.toThrow(NotFoundException);
  });
});

describe('OrdersService.myOrders / myOrder', () => {
  it('lists only the customer own orders, newest first, filtering by status', async () => {
    const { service, db } = buildService({});

    const result = await service.myOrders('cust-1', 'PLACED');

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: 'cust-1', status: 'PLACED' },
        orderBy: { placedAt: 'desc' },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      orderNumber: 'HB-20260925-000001',
      itemCount: 2,
      totalMinor: 70800,
    });
  });

  it('returns own order detail with a held address snapshot', async () => {
    const { service, db } = buildService({});

    const detail = await service.myOrder('cust-1', 'o1');

    expect(db.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1', customerId: 'cust-1' } }),
    );
    expect(detail.orderNumber).toBe('HB-20260925-000001');
    expect(detail.address).toMatchObject({
      houseFlat: '1-2',
      city: 'Guntur',
      postalCode: '522001',
    });
    expect(detail.items).toHaveLength(1);
    expect(detail.payments[0]).toMatchObject({ method: 'UPI', status: 'PAID', amountMinor: 70800 });
  });

  it('rejects access to another customer order detail', async () => {
    const db = baseDb();
    (db.order as { findFirst: ReturnType<typeof vi.fn> }).findFirst = vi
      .fn()
      .mockResolvedValue(null);
    const { service } = buildService({ db });

    await expect(service.myOrder('cust-1', 'o-other')).rejects.toThrow(NotFoundException);
  });
});
