import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStateService } from '../orders/order-state.service';
import { BranchOrdersService } from './branch-orders.service';

function baseDb() {
  const db = {
    order: {
      findMany: vi.fn().mockResolvedValue([
        {
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
          placedAt: new Date(),
          cancelledAt: null,
        },
      ]),
      findUnique: vi.fn().mockResolvedValue({ id: 'o1', status: 'PLACED', branchId: 'b1' }),
      findFirst: vi
        .fn()
        .mockImplementation(async ({ where }: { where: { id: string; branchId?: string } }) => {
          if (where.id === 'o1' && (!where.branchId || where.branchId === 'b1')) {
            return {
              id: 'o1',
              orderNumber: 'HB-20260925-000001',
              status: 'PLACED',
              paymentStatus: 'PAID',
              branch: {
                id: 'b1',
                name: 'Hungry Box Guntur (Demo)',
                code: 'guntur',
                city: 'Guntur',
              },
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
                  createdAt: new Date(),
                },
              ],
              subtotalMinor: 59800,
              discountMinor: 4000,
              deliveryFeeMinor: 3000,
              taxMinor: 0,
              totalMinor: 70800,
              placedAt: new Date(),
              cancelledAt: null,
            };
          }
          return null;
        }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    orderEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    payment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
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
  opts: { db?: T } = {},
) {
  const db = (opts.db ?? baseDb()) as T;
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new BranchOrdersService(prisma, new OrderStateService(), audit as never);
  return { service, db, audit };
}

const superAdmin = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-super' };
const gunturManager = { role: 'BRANCH_MANAGER' as const, branchId: 'b1', userId: 'u-guntur' };
const otherManager = { role: 'BRANCH_MANAGER' as const, branchId: 'b9', userId: 'u-other' };

describe('BranchOrdersService.list', () => {
  it('lets a super admin see every branch and filter by branchId', async () => {
    const { service, db } = buildService({});

    await service.list(superAdmin, { branchId: 'b1' });

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'b1' }) }),
    );
  });

  it('pins a branch manager to their own branch even if they pass another branchId', async () => {
    const { service, db } = buildService({});

    await service.list(gunturManager, { branchId: 'b9' });

    const call = db.order.findMany.mock.calls[0][0];
    expect(call.where.branchId).toBe('b1');
    expect(call.where.branchId).not.toBe('b9');
  });

  it('filters by status and placement window when provided', async () => {
    const { service, db } = buildService({});

    await service.list(superAdmin, {
      status: 'PLACED',
      from: '2026-09-25T00:00:00.000Z',
      to: '2026-09-26T00:00:00.000Z',
    });

    const call = db.order.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('PLACED');
    expect(call.where.placedAt.gte).toBeInstanceOf(Date);
    expect(call.where.placedAt.lte).toBeInstanceOf(Date);
  });

  it('is bounded and paged, defaulting to the first 25 newest orders', async () => {
    const { service, db } = buildService({});

    const result = await service.list(superAdmin, {});

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 }),
    );
    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
    expect(result.total).toBe(0);
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('orders by placedAt then id so a page boundary cannot repeat an order', async () => {
    const { service, db } = buildService({});

    await service.list(superAdmin, {});

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ placedAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('translates page and limit into skip and take and echoes them back', async () => {
    const { service, db } = buildService({});
    db.order.count.mockResolvedValue(140);

    const result = await service.list(superAdmin, { page: 3, limit: 50 });

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 }),
    );
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
    expect(result.total).toBe(140);
  });

  it('counts the same filtered population it pages over', async () => {
    const { service, db } = buildService({});
    db.order.count.mockResolvedValue(7);

    await service.list(gunturManager, { status: 'PREPARING' });

    const countWhere = db.order.count.mock.calls[0][0].where;
    const listWhere = db.order.findMany.mock.calls[0][0].where;
    expect(countWhere).toEqual(listWhere);
    expect(countWhere).toEqual(
      expect.objectContaining({ branchId: 'b1', status: 'PREPARING' }),
    );
  });

  it('caps a caller-supplied limit so one request cannot ask for every order', async () => {
    const { service, db } = buildService({});

    await service.list(superAdmin, { limit: 100_000 });

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});

describe('BranchOrdersService.counts', () => {
  it('derives dashboard counts with one grouped query instead of loading orders', async () => {
    const { service, db } = buildService({});
    db.order.groupBy.mockResolvedValue([
      { status: 'PLACED', _count: { _all: 4 } },
      { status: 'CONFIRMED', _count: { _all: 2 } },
      { status: 'PREPARING', _count: { _all: 3 } },
      { status: 'READY_FOR_PICKUP', _count: { _all: 1 } },
      { status: 'OUT_FOR_DELIVERY', _count: { _all: 5 } },
    ]);

    const counts = await service.counts(gunturManager, {});

    expect(counts).toEqual({
      newOrders: 4,
      preparing: 5,
      ready: 1,
      outForDelivery: 5,
      total: 15,
    });
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('ignores a status filter so the dashboard always shows the whole funnel', async () => {
    const { service, db } = buildService({});
    db.order.groupBy.mockResolvedValue([{ status: 'PLACED', _count: { _all: 1 } }]);

    await service.counts(gunturManager, { status: 'DELIVERED' });

    const where = db.order.groupBy.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.branchId).toBe('b1');
  });

  it('reports zeroes for a branch with no orders', async () => {
    const { service, db } = buildService({});
    db.order.groupBy.mockResolvedValue([]);

    await expect(service.counts(gunturManager, {})).resolves.toEqual({
      newOrders: 0,
      preparing: 0,
      ready: 0,
      outForDelivery: 0,
      total: 0,
    });
  });

  it('pins the counts to a manager branch even when another branchId is passed', async () => {
    const { service, db } = buildService({});
    db.order.groupBy.mockResolvedValue([]);

    /**
     * counts() issues its own query, so the list's branch pinning does not cover it. If this
     * were left open it would report another branch's funnel on the manager's home screen
     * while the table underneath showed their own orders.
     */
    await service.counts(gunturManager, { branchId: 'b9' });

    const where = db.order.groupBy.mock.calls[0][0].where;
    expect(where.branchId).toBe('b1');
  });
});

describe('BranchOrdersService.get', () => {
  it('a manager cannot read an order from another branch (no IDOR)', async () => {
    const { service } = buildService({});

    await expect(service.get(otherManager, 'o1')).rejects.toThrow(NotFoundException);
  });

  it('returns an owned-branch order to the manager and any order to the super admin', async () => {
    const { service } = buildService({});

    await expect(service.get(gunturManager, 'o1')).resolves.toMatchObject({ id: 'o1' });
    await expect(service.get(superAdmin, 'o1')).resolves.toMatchObject({ id: 'o1' });
  });
});

describe('BranchOrdersService.advanceStatus', () => {
  it('moves an order forward and records the matching timestamp field', async () => {
    const { service, db, audit } = buildService({});

    await service.advanceStatus(gunturManager, 'o1', { status: 'CONFIRMED' });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({ status: 'CONFIRMED', confirmedAt: expect.any(Date) }),
      }),
    );
    expect(db.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStatus: 'PLACED', toStatus: 'CONFIRMED' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ORDER_STATUS_CHANGED' }),
    );
  });

  it('rejects an out-of-order jump', async () => {
    const { service, db } = buildService({});

    const error = await service
      .advanceStatus(gunturManager, 'o1', { status: 'PREPARING' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('rejects advancing a delivered order', async () => {
    const db = baseDb();
    db.order.findUnique = vi
      .fn()
      .mockResolvedValue({ id: 'o1', status: 'DELIVERED', branchId: 'b1' });
    const { service } = buildService({ db });

    await expect(
      service.advanceStatus(gunturManager, 'o1', { status: 'DELIVERED' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not let a manager advance another branch order', async () => {
    const { service, db } = buildService({});

    await expect(
      service.advanceStatus(otherManager, 'o1', { status: 'CONFIRMED' }),
    ).rejects.toThrow(NotFoundException);
    expect(db.order.update).not.toHaveBeenCalled();
  });
});

describe('BranchOrdersService.cancel', () => {
  it('lets staff cancel an order still in preparation', async () => {
    const db = baseDb();
    db.order.findUnique = vi
      .fn()
      .mockResolvedValue({ id: 'o1', status: 'PREPARING', branchId: 'b1' });
    const { service, audit } = buildService({ db });

    await service.cancel(gunturManager, 'o1', { reason: 'Customer unavailable' });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledByRole: 'BRANCH_MANAGER',
          cancellationReason: 'Customer unavailable',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ORDER_CANCELLED' }));
  });

  it('refuses cancellation once the order is out for delivery', async () => {
    const db = baseDb();
    db.order.findUnique = vi
      .fn()
      .mockResolvedValue({ id: 'o1', status: 'OUT_FOR_DELIVERY', branchId: 'b1' });
    const { service } = buildService({ db });

    await expect(service.cancel(gunturManager, 'o1', {})).rejects.toThrow(BadRequestException);
  });
});

describe('BranchOrdersService.collectCod', () => {
  it('records COD cash collection for a pending COD order', async () => {
    const db = baseDb();
    db.order.findUnique = vi
      .fn()
      .mockResolvedValue({ id: 'o1', branchId: 'b1', orderNumber: 'HB-1', status: 'OUT_FOR_DELIVERY' });
    const { service, audit } = buildService({ db });

    await service.collectCod(gunturManager, 'o1', { reason: 'Cash collected, app failed during final step' });

    expect(db.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderId: 'o1',
          method: 'COD',
          status: 'PENDING',
        }),
        data: expect.objectContaining({
          status: 'PAID',
          collectedByRole: 'BRANCH_MANAGER',
          collectedById: 'u-guntur',
        }),
      }),
    );
    expect(db.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1', status: { notIn: ['CANCELLED', 'DELIVERED'] } },
        data: { paymentStatus: 'PAID' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'COD_COLLECTION_CORRECTED',
        actorId: 'u-guntur',
        branchId: 'b1',
      }),
    );
  });

  it('never double-collects an already collected COD payment', async () => {
    const db = baseDb();
    db.order.findUnique = vi
      .fn()
      .mockResolvedValue({ id: 'o1', branchId: 'b1', orderNumber: 'HB-1', status: 'OUT_FOR_DELIVERY' });
    db.payment.updateMany = vi.fn().mockResolvedValue({ count: 0 });
    db.payment.count = vi.fn().mockResolvedValue(1);
    const { service } = buildService({ db });

    const error = await service
      .collectCod(gunturManager, 'o1', { reason: 'double' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toMatchObject({ response: { code: 'cod.already_collected' } });
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('does not let a manager correct another branch order', async () => {
    const { service, db } = buildService({});

    await expect(
      service.collectCod(otherManager, 'o1', { reason: 'no access' }),
    ).rejects.toThrow(NotFoundException);
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });

  it('forces a non-empty reason', async () => {
    const db = baseDb();
    db.order.findUnique = vi
      .fn()
      .mockResolvedValue({ id: 'o1', branchId: 'b1', orderNumber: 'HB-1', status: 'OUT_FOR_DELIVERY' });
    const { service } = buildService({ db });

    await expect(service.collectCod(gunturManager, 'o1', { reason: ' ' })).rejects.toThrow(
      BadRequestException,
    );
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });
});
