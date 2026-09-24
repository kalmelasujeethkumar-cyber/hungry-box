import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    },
    orderEvent: {
      create: vi.fn().mockResolvedValue({}),
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

const superAdmin = { role: 'SUPER_ADMIN' as const, branchId: null };
const gunturManager = { role: 'BRANCH_MANAGER' as const, branchId: 'b1' };
const otherManager = { role: 'BRANCH_MANAGER' as const, branchId: 'b9' };

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
