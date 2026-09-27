import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

function buildService<T extends Record<string, unknown>>(db: T) {
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  return new AnalyticsService(prisma);
}

function order(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'o1',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    branchId: 'b1',
    customerId: 'c1',
    totalMinor: 10000,
    placedAt: new Date('2026-01-05T10:00:00.000Z'),
    ...overrides,
  };
}

function emptyDialect() {
  return {
    orderItem: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    branch: { findMany: vi.fn().mockResolvedValue([]) },
    deliveryPartnerProfile: { count: vi.fn().mockResolvedValue(0) },
    deliveryAssignment: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

/** UTC instants paired with the Asia/Kolkata reading the dashboard must report. */
const IST = {
  /** 00:00:00.000 IST on 2026-03-10 */
  dayStart: new Date('2026-03-09T18:30:00.000Z'),
  /** 05:29:00 IST on 2026-03-10 */
  beforeOffsetBoundary: new Date('2026-03-09T23:59:00.000Z'),
  /** 23:59:59.999 IST on 2026-03-10 */
  lastInstantOfDay: new Date('2026-03-10T18:29:59.999Z'),
  /** 00:00:00.000 IST on 2026-03-11 */
  nextDayStart: new Date('2026-03-10T18:30:00.000Z'),
} as const;

describe('AnalyticsService.dashboard', () => {
  it('aggregates revenue, orders, customers, statuses, methods, delivery, branches and time series', async () => {
    const itemsByOrder: Record<string, Array<Record<string, unknown>>> = {
      o1: [
        { productId: 'p1', productName: 'Biryani', quantity: 2, lineTotalMinor: 20000 },
        { productId: 'p2', productName: 'Spring Roll', quantity: 1, lineTotalMinor: 15000 },
      ],
      o2: [{ productId: 'p1', productName: 'Biryani', quantity: 1, lineTotalMinor: 10000 }],
    };
    const paymentStatusByOrder: Record<string, string> = { o1: 'PAID', o2: 'REFUNDED' };
    const db = {
      order: {
        findMany: vi.fn().mockResolvedValue([
          order({
            id: 'o1',
            branchId: 'b1',
            customerId: 'c1',
            totalMinor: 10000,
            placedAt: new Date('2026-01-05T10:00:00.000Z'),
          }),
          order({
            id: 'o2',
            branchId: 'b1',
            customerId: 'c2',
            totalMinor: 5000,
            status: 'CANCELLED',
            paymentStatus: 'REFUNDED',
            placedAt: new Date('2026-01-10T10:00:00.000Z'),
          }),
          order({
            id: 'o3',
            branchId: 'b2',
            customerId: 'c1',
            totalMinor: 25000,
            placedAt: new Date('2026-01-20T10:00:00.000Z'),
          }),
        ]),
      },
      orderItem: {
        findMany: vi.fn().mockImplementation(
          ({ where }: { where: { order: Prisma.OrderWhereInput } }) => {
            const required = where.order.paymentStatus;
            const rows = Object.entries(itemsByOrder).flatMap(([orderId, items]) =>
              required && paymentStatusByOrder[orderId] !== required ? [] : items,
            );
            return Promise.resolve(rows);
          },
        ),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([
          { method: 'COD', amountMinor: 10000, orderId: 'o1', status: 'PAID' },
          { method: 'UPI', amountMinor: 5000, orderId: 'o2', status: 'REFUNDED' },
          { method: 'COD', amountMinor: 25000, orderId: 'o3', status: 'PAID' },
        ]),
      },
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'b1', name: 'Hungry Box Guntur', status: 'ACTIVE' },
          { id: 'b2', name: 'Hungry Box Hyderabad', status: 'PAUSED' },
        ]),
      },
      deliveryPartnerProfile: { count: vi.fn().mockResolvedValue(4) },
      deliveryAssignment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { status: 'ASSIGNED' },
            { status: 'DELIVERED' },
            { status: 'CANCELLED' },
          ]),
      },
    };
    const service = buildService(db);

    const result = await service.dashboard({
      from: '2026-01-01',
      to: '2026-01-31',
      bucket: 'month',
    });

    expect(result.revenueMinor).toBe(35000);
    expect(result.orders).toBe(3);
    expect(result.customers).toBe(2);
    expect(result.averageOrderValueMinor).toBe(17500);
    expect(result.activeBranches).toBe(1);
    expect(result.pausedBranches).toBe(1);
    expect(result.inactiveBranches).toBe(0);
    expect(result.cancellations).toEqual({ count: 1, amountMinor: 5000 });
    expect(result.refunds).toEqual({ count: 1, amountMinor: 5000 });

    expect(result.orderStatusBreakdown).toEqual([
      { status: 'DELIVERED', count: 2, totalMinor: 35000 },
      { status: 'CANCELLED', count: 1, totalMinor: 5000 },
    ]);
    expect(result.paymentMethodBreakdown).toEqual([
      { method: 'COD', count: 2, totalMinor: 35000 },
    ]);
    expect(result.cod).toEqual({
      totalOrders: 2,
      collectedCount: 2,
      collectedMinor: 35000,
      uncollectedCount: 0,
      uncollectedMinor: 0,
    });
    expect(result.delivery).toEqual({
      activePartners: 4,
      assigned: 1,
      outForDelivery: 0,
      delivered: 1,
      cancelledOrRejected: 1,
    });
    expect(result.branchComparison).toEqual([
      {
        branchId: 'b1',
        branchName: 'Hungry Box Guntur',
        status: 'ACTIVE',
        orders: 2,
        revenueMinor: 10000,
      },
      {
        branchId: 'b2',
        branchName: 'Hungry Box Hyderabad',
        status: 'PAUSED',
        orders: 1,
        revenueMinor: 25000,
      },
    ]);
    expect(result.topProducts).toEqual([
      { productId: 'p1', productName: 'Biryani', quantity: 2, revenueMinor: 20000 },
      { productId: 'p2', productName: 'Spring Roll', quantity: 1, revenueMinor: 15000 },
    ]);
    expect(result.timeSeries).toEqual([
      { period: '2026-01', label: 'Jan 2026', orders: 3, revenueMinor: 35000, cancelledOrders: 1 },
    ]);
  });

  it('restricts order items behind top products to paid orders', async () => {
    const db = {
      order: { findMany: vi.fn().mockResolvedValue([order({})]) },
      ...emptyDialect(),
    };
    const service = buildService(db);

    await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(db.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { order: { paymentStatus: 'PAID', placedAt: expect.anything() } },
      }),
    );
  });

  it('zero-fills empty days in a daily time series', async () => {
    const db = {
      order: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            order({ id: 'o1', placedAt: new Date('2026-01-01T10:00:00.000Z') }),
            order({ id: 'o3', placedAt: new Date('2026-01-03T10:00:00.000Z') }),
          ]),
      },
      ...emptyDialect(),
    };
    const service = buildService(db);

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-03', bucket: 'day' });

    expect(result.timeSeries).toEqual([
      { period: '2026-01-01', label: '1 Jan', orders: 1, revenueMinor: 10000, cancelledOrders: 0 },
      { period: '2026-01-02', label: '2 Jan', orders: 0, revenueMinor: 0, cancelledOrders: 0 },
      { period: '2026-01-03', label: '3 Jan', orders: 1, revenueMinor: 10000, cancelledOrders: 0 },
    ]);
  });

  it('defaults the bucket by range span and coarsens an oversized requested bucket', async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValue([]) }, ...emptyDialect() };
    const service = buildService(db);

    const daily = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });
    expect(daily.timeSeries).toHaveLength(31);
    expect(daily.timeSeries[0].period).toBe('2026-01-01');

    const wide = await service.dashboard({
      from: '2025-01-01',
      to: '2026-12-31',
      bucket: 'day',
    });
    expect(wide.timeSeries.length).toBeLessThanOrEqual(366);
    expect(wide.timeSeries[0].label).toMatch(/^Week of/);
  });

  it('reports uncollected COD net of cancelled orders', async () => {
    const db = {
      order: {
        findMany: vi.fn().mockResolvedValue([
          order({ id: 'o1', status: 'OUT_FOR_DELIVERY', paymentStatus: 'PENDING', totalMinor: 10000 }),
          order({ id: 'o2', status: 'CANCELLED', paymentStatus: 'PENDING', totalMinor: 8000 }),
          order({ id: 'o3', status: 'DELIVERED', paymentStatus: 'PAID', totalMinor: 55000 }),
        ]),
      },
      ...emptyDialect(),
      payment: {
        findMany: vi.fn().mockResolvedValue([
          { method: 'COD', amountMinor: 10000, orderId: 'o1', status: 'PENDING' },
          { method: 'COD', amountMinor: 8000, orderId: 'o2', status: 'PENDING' },
          { method: 'COD', amountMinor: 55000, orderId: 'o3', status: 'PAID' },
        ]),
      },
    };
    const service = buildService(db);

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(result.cod).toEqual({
      totalOrders: 3,
      collectedCount: 1,
      collectedMinor: 55000,
      uncollectedCount: 1,
      uncollectedMinor: 10000,
    });
  });

  it('rejects a reversed range', async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValue([]) }, ...emptyDialect() };
    const service = buildService(db);

    await expect(service.dashboard({ from: '2026-02-01', to: '2026-01-01' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('AnalyticsService revenue semantics', () => {
  function dashboardWith(orders: Array<ReturnType<typeof order>>, payments: unknown[] = []) {
    const db = {
      order: { findMany: vi.fn().mockResolvedValue(orders) },
      ...emptyDialect(),
      payment: { findMany: vi.fn().mockResolvedValue(payments) },
    };
    return { service: buildService(db), db };
  }

  it('counts only paid orders toward revenue', async () => {
    const { service } = dashboardWith([
      order({ id: 'o1', paymentStatus: 'PAID', totalMinor: 20000 }),
      order({ id: 'o2', paymentStatus: 'PENDING', totalMinor: 90000 }),
      order({ id: 'o3', paymentStatus: 'AUTHORIZED', totalMinor: 70000 }),
      order({ id: 'o4', paymentStatus: 'FAILED', totalMinor: 60000 }),
      order({ id: 'o5', paymentStatus: 'CANCELLED', totalMinor: 50000 }),
      order({ id: 'o6', paymentStatus: 'REFUNDED', totalMinor: 40000 }),
    ]);

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(result.revenueMinor).toBe(20000);
  });

  it('averages over paid orders only, so cancelled orders do not deflate the average', async () => {
    const { service } = dashboardWith([
      order({ id: 'o1', paymentStatus: 'PAID', totalMinor: 20000 }),
      order({ id: 'o2', paymentStatus: 'PAID', totalMinor: 30000 }),
      order({ id: 'o3', status: 'CANCELLED', paymentStatus: 'CANCELLED', totalMinor: 50000 }),
    ]);

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(result.revenueMinor).toBe(50000);
    expect(result.averageOrderValueMinor).toBe(25000);
    expect(result.orders).toBe(3);
  });

  it('reports a zero average when no order has been paid', async () => {
    const { service } = dashboardWith([
      order({ id: 'o1', paymentStatus: 'PENDING', totalMinor: 10000 }),
      order({ id: 'o2', status: 'CANCELLED', paymentStatus: 'CANCELLED', totalMinor: 20000 }),
    ]);

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(result.revenueMinor).toBe(0);
    expect(result.averageOrderValueMinor).toBe(0);
    expect(result.orders).toBe(2);
  });

  it('reports a zero average when the period has no orders at all', async () => {
    const { service } = dashboardWith([]);

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(result.revenueMinor).toBe(0);
    expect(result.averageOrderValueMinor).toBe(0);
    expect(result.orders).toBe(0);
    expect(result.topProducts).toEqual([]);
    expect(result.timeSeries.every((point) => point.orders === 0 && point.revenueMinor === 0)).toBe(
      true,
    );
  });

  it('reconciles payment-method revenue with headline revenue under PAID semantics', async () => {
    const { service } = dashboardWith(
      [
        order({ id: 'o1', paymentStatus: 'PAID', totalMinor: 20000 }),
        order({ id: 'o2', paymentStatus: 'PAID', totalMinor: 30000 }),
        order({ id: 'o3', paymentStatus: 'PENDING', totalMinor: 40000 }),
        order({ id: 'o4', status: 'CANCELLED', paymentStatus: 'REFUNDED', totalMinor: 50000 }),
      ],
      [
        { method: 'UPI', amountMinor: 20000, orderId: 'o1', status: 'PAID' },
        { method: 'COD', amountMinor: 30000, orderId: 'o2', status: 'PAID' },
        { method: 'UPI', amountMinor: 40000, orderId: 'o3', status: 'PENDING' },
        { method: 'CARD', amountMinor: 50000, orderId: 'o4', status: 'REFUNDED' },
        { method: 'WALLET', amountMinor: 11000, orderId: null, status: 'FAILED' },
      ],
    );

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(result.paymentMethodBreakdown).toEqual([
      { method: 'COD', count: 1, totalMinor: 30000 },
      { method: 'UPI', count: 1, totalMinor: 20000 },
    ]);
    const breakdownTotal = result.paymentMethodBreakdown.reduce(
      (sum, method) => sum + method.totalMinor,
      0,
    );
    expect(breakdownTotal).toBe(result.revenueMinor);
  });

  it('keeps the COD summary on unpaid payments while revenue stays paid-only', async () => {
    const { service } = dashboardWith(
      [
        order({ id: 'o1', paymentStatus: 'PAID', totalMinor: 20000 }),
        order({ id: 'o2', status: 'OUT_FOR_DELIVERY', paymentStatus: 'PENDING', totalMinor: 15000 }),
      ],
      [
        { method: 'COD', amountMinor: 20000, orderId: 'o1', status: 'PAID' },
        { method: 'COD', amountMinor: 15000, orderId: 'o2', status: 'PENDING' },
      ],
    );

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(result.revenueMinor).toBe(20000);
    expect(result.cod.uncollectedMinor).toBe(15000);
  });
});

describe('AnalyticsService active partner scope', () => {
  it('counts active partners across all branches when unfiltered', async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValue([]) }, ...emptyDialect() };
    const service = buildService(db);

    await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(db.deliveryPartnerProfile.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
  });

  it('counts active partners of the selected branch when branch filtered', async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValue([]) }, ...emptyDialect() };
    const service = buildService(db);

    await service.dashboard({ from: '2026-01-01', to: '2026-01-31', branchId: 'b2' });

    expect(db.deliveryPartnerProfile.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', branchId: 'b2' },
    });
  });
});

describe('AnalyticsService branch isolation', () => {
  it('applies the selected branch to every scoped query', async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValue([]) }, ...emptyDialect() };
    const service = buildService(db);

    await service.dashboard({ from: '2026-01-01', to: '2026-01-31', branchId: 'b1' });

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'b1' }) }),
    );
    expect(db.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { order: expect.objectContaining({ branchId: 'b1' }) },
      }),
    );
    expect(db.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { order: expect.objectContaining({ branchId: 'b1' }) } }),
    );
    expect(db.deliveryAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { order: expect.objectContaining({ branchId: 'b1' }) } }),
    );
  });

  it('does not aggregate another branch into a branch-filtered result', async () => {
    const db = {
      order: {
        findMany: vi.fn().mockResolvedValue([
          order({ id: 'o1', branchId: 'b1', customerId: 'c1', totalMinor: 10000 }),
        ]),
      },
      ...emptyDialect(),
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'b1', name: 'Guntur', status: 'ACTIVE' },
          { id: 'b2', name: 'Hyderabad', status: 'ACTIVE' },
        ]),
      },
    };
    const service = buildService(db);

    const result = await service.dashboard({
      from: '2026-01-01',
      to: '2026-01-31',
      branchId: 'b1',
    });

    expect(result.revenueMinor).toBe(10000);
    const hyderabad = result.branchComparison.find((row) => row.branchId === 'b2');
    expect(hyderabad?.orders).toBe(0);
    expect(hyderabad?.revenueMinor).toBe(0);
  });
});

  describe('AnalyticsService order status filter', () => {
    function statusDb() {
      return {
        order: { findMany: vi.fn().mockResolvedValue([]) },
        ...emptyDialect(),
        deliveryAssignment: { findMany: vi.fn().mockResolvedValue([]) },
      };
    }

    it('applies the status to the order population', async () => {
      const db = statusDb();
      const service = buildService(db);

      await service.dashboard({ status: 'DELIVERED' });

      expect(db.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'DELIVERED' }) }),
      );
    });

    it('applies the status to the nested payment and item populations', async () => {
      const db = statusDb();
      const service = buildService(db);

      await service.dashboard({ status: 'DELIVERED' });

      expect(db.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ order: expect.objectContaining({ status: 'DELIVERED' }) }),
        }),
      );
      expect(db.orderItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ order: expect.objectContaining({ status: 'DELIVERED' }) }),
        }),
      );
    });

    it('combines the status with a branch filter rather than replacing it', async () => {
      const db = statusDb();
      const service = buildService(db);

      await service.dashboard({ status: 'PLACED', branchId: 'b1' });

      expect(db.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 'b1', status: 'PLACED' }),
        }),
      );
    });

    it('keeps revenue paid-only when a status is selected', async () => {
      const db = statusDb();
      const service = buildService(db);

      await service.dashboard({ status: 'PLACED' });

      const revenueWhere = db.orderItem.findMany.mock.calls[0]?.[0]?.where as {
        order: { paymentStatus: string; status: string };
      };
      expect(revenueWhere.order.paymentStatus).toBe('PAID');
      expect(revenueWhere.order.status).toBe('PLACED');
    });

    it('reports zero revenue for a status with no paid orders', async () => {
      const db = statusDb();
      const service = buildService(db);

      const summary = await service.dashboard({ status: 'PLACED' });

      expect(summary.revenueMinor).toBe(0);
      expect(summary.orders).toBe(0);
    });

    it('leaves branch status counts alone because a branch is not an order', async () => {
      const db = {
        ...statusDb(),
        branch: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'b1', name: 'Guntur', status: 'ACTIVE' },
            { id: 'b2', name: 'Vijayawada', status: 'PAUSED' },
          ]),
        },
      };
      const service = buildService(db);

      const summary = await service.dashboard({ status: 'PLACED' });

      expect(summary.activeBranches).toBe(1);
      expect(summary.pausedBranches).toBe(1);
    });

    it('sends no status constraint when the filter is absent', async () => {
      const db = statusDb();
      const service = buildService(db);

      await service.dashboard({});

      const where = db.order.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where).not.toHaveProperty('status');
    });
  });

  describe('AnalyticsService business-time reporting boundaries', () => {
  function seriesFor(orders: Array<ReturnType<typeof order>>, query: Record<string, string>) {
    const db = {
      order: { findMany: vi.fn().mockResolvedValue(orders) },
      ...emptyDialect(),
    };
    return buildService(db).dashboard(query);
  }

  it('scopes the reported range to midnight-to-midnight business time', async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValue([]) }, ...emptyDialect() };
    const service = buildService(db);

    await service.dashboard({ from: '2026-03-10', to: '2026-03-10' });

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          placedAt: {
            gte: new Date('2026-03-09T18:30:00.000Z'),
            lte: new Date('2026-03-10T18:29:59.999Z'),
          },
        }),
      }),
    );
  });

  it('buckets 05:29 IST and 00:00 IST into the same business day', async () => {
    const result = await seriesFor(
      [
        order({ id: 'o1', placedAt: IST.beforeOffsetBoundary }),
        order({ id: 'o2', placedAt: IST.nextDayStart }),
      ],
      { from: '2026-03-10', to: '2026-03-11', bucket: 'day' },
    );

    const periods = result.timeSeries.map((point) => point.period);
    expect(periods).toContain('2026-03-10');
    expect(periods).not.toContain('2026-03-09');
    const first = result.timeSeries.find((point) => point.period === '2026-03-10');
    const second = result.timeSeries.find((point) => point.period === '2026-03-11');
    expect(first?.orders).toBe(1);
    expect(second?.orders).toBe(1);
  });

  it('keeps 23:59:59.999 IST inside its own day and 00:00 IST in the next', async () => {
    const result = await seriesFor(
      [
        order({ id: 'o1', placedAt: IST.lastInstantOfDay }),
        order({ id: 'o2', placedAt: IST.nextDayStart }),
      ],
      { from: '2026-03-10', to: '2026-03-11', bucket: 'day' },
    );

    const day10 = result.timeSeries.find((point) => point.period === '2026-03-10');
    const day11 = result.timeSeries.find((point) => point.period === '2026-03-11');
    expect(day10?.orders).toBe(1);
    expect(day11?.orders).toBe(1);
    expect(day10?.label).toBe('10 Mar');
    expect(day11?.label).toBe('11 Mar');
  });

  it('starts the first bucket of a range at business midnight', async () => {
    const result = await seriesFor([], { from: '2026-03-10', to: '2026-03-10', bucket: 'day' });

    expect(result.timeSeries).toHaveLength(1);
    expect(result.timeSeries[0]).toEqual({
      period: '2026-03-10',
      label: '10 Mar',
      orders: 0,
      revenueMinor: 0,
      cancelledOrders: 0,
    });
  });

  it('walks weekly buckets back to Monday business time', async () => {
    const result = await seriesFor(
      [
        // 12:00 IST Wednesday, and 12:00 IST Sunday of the same Monday-started week.
        order({ id: 'o1', placedAt: new Date('2026-03-11T06:30:00.000Z') }),
        order({ id: 'o2', placedAt: new Date('2026-03-15T06:30:00.000Z') }),
      ],
      { from: '2026-03-09', to: '2026-03-15', bucket: 'week' },
    );

    expect(result.timeSeries).toHaveLength(1);
    expect(result.timeSeries[0].period).toBe('2026-03-09');
    expect(result.timeSeries[0].label).toBe('Week of 9 Mar');
    expect(result.timeSeries[0].orders).toBe(2);
  });

  it('splits monthly buckets on the business month boundary', async () => {
    const result = await seriesFor(
      [
        order({ id: 'o1', placedAt: new Date('2026-02-28T18:29:59.000Z') }),
        order({ id: 'o2', placedAt: new Date('2026-02-28T18:30:00.000Z') }),
      ],
      { from: '2026-02-01', to: '2026-03-31', bucket: 'month' },
    );

    expect(result.timeSeries.map((point) => point.period)).toEqual(['2026-02', '2026-03']);
    expect(result.timeSeries[0].orders).toBe(1);
    expect(result.timeSeries[1].orders).toBe(1);
  });

  it('splits yearly buckets on the business year boundary', async () => {
    const result = await seriesFor(
      [
        order({ id: 'o1', placedAt: new Date('2025-12-31T18:29:59.000Z') }),
        order({ id: 'o2', placedAt: new Date('2025-12-31T18:30:00.000Z') }),
      ],
      { from: '2025-01-01', to: '2026-12-31', bucket: 'year' },
    );

    expect(result.timeSeries.map((point) => point.period)).toEqual(['2025', '2026']);
  });
});

describe('AnalyticsService cancellation and refund reporting', () => {
  it('reports cancelled orders and refunded orders as gross order value', async () => {
    const db = {
      order: {
        findMany: vi.fn().mockResolvedValue([
          order({ id: 'o1', status: 'CANCELLED', paymentStatus: 'CANCELLED', totalMinor: 5000 }),
          order({ id: 'o2', status: 'CANCELLED', paymentStatus: 'REFUNDED', totalMinor: 7000 }),
          order({ id: 'o3', status: 'DELIVERED', paymentStatus: 'PAID', totalMinor: 9000 }),
        ]),
      },
      ...emptyDialect(),
    };
    const service = buildService(db);

    const result = await service.dashboard({ from: '2026-01-01', to: '2026-01-31' });

    expect(result.cancellations).toEqual({ count: 2, amountMinor: 12000 });
    expect(result.refunds).toEqual({ count: 1, amountMinor: 7000 });
  });
});

describe('AnalyticsService.ordersReportCsv', () => {
  it('emits a deliberate column order and correctly escaped data rows', async () => {
    const db = {
      order: {
        findMany: vi.fn().mockResolvedValue([
          {
            orderNumber: 'HB-1024',
            placedAt: new Date('2026-01-05T10:00:00.000Z'),
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            subtotalMinor: 29900,
            discountMinor: 0,
            deliveryFeeMinor: 4000,
            taxMinor: 1000,
            totalMinor: 34900,
            branch: { name: 'Guntur, Andhra Pradesh' },
            items: [{ quantity: 2 }, { quantity: 1 }],
            payments: [{ method: 'UPI' }],
          },
        ]),
      },
    };
    const service = buildService(db);

    const csv = await service.ordersReportCsv({ from: '2026-01-01', to: '2026-01-31' });

    expect(csv.split('\n')[0]).toBe(
      'orderNumber,placedAtIst,branchName,status,paymentStatus,paymentMethod,itemCount,subtotalMinor,discountMinor,deliveryFeeMinor,taxMinor,totalMinor,collectedAtIst,collectedByRole,collectedById',
    );
    expect(csv).toContain('"Guntur, Andhra Pradesh"');
    expect(csv).toContain(',3,29900,0,4000,1000,34900,,,');
    // 10:00Z is 15:30 IST on 5 Jan.
    expect(csv).toContain('2026-01-05 15:30:00 +05:30');
  });

  it('exports in business time and orders newest-first with a deterministic tiebreak', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        orderNumber: 'HB-2',
        placedAt: new Date('2026-01-06T11:30:00.000Z'),
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        subtotalMinor: 39900,
        discountMinor: 0,
        deliveryFeeMinor: 4000,
        taxMinor: 1200,
        totalMinor: 45100,
        branch: { name: 'Guntur' },
        items: [{ quantity: 1 }],
        payments: [
          {
            method: 'COD',
            collectedAt: new Date('2026-01-06T12:00:00.000Z'),
            collectedByRole: 'DELIVERY_PARTNER',
            collectedById: 'u-partner',
          },
        ],
      },
    ]);
    const service = buildService({ order: { findMany } });

    const csv = await service.ordersReportCsv({ from: '2026-01-01', to: '2026-01-31' });

    // 11:30Z and 12:00Z are 17:00 and 17:30 IST on 6 Jan.
    expect(csv).toContain('2026-01-06 17:00:00 +05:30,Guntur');
    expect(csv).toContain('2026-01-06 17:30:00 +05:30,DELIVERY_PARTNER,u-partner');
    expect(csv.split('\n')[1]).toBe(
      'HB-2,2026-01-06 17:00:00 +05:30,Guntur,DELIVERED,PAID,COD,1,39900,0,4000,1200,45100,2026-01-06 17:30:00 +05:30,DELIVERY_PARTNER,u-partner',
    );

    const call = findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ placedAt: 'desc' }, { id: 'desc' }]);
    // The payment shown must be chosen deterministically, not "whatever came first".
    expect(call.select.payments.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('applies business-day boundaries to the requested range', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = buildService({ order: { findMany } });

    await service.ordersReportCsv({ from: '2026-01-01', to: '2026-01-31' });

    expect(findMany.mock.calls[0][0].where.placedAt).toEqual({
      gte: new Date('2025-12-31T18:30:00.000Z'),
      lte: new Date('2026-01-31T18:29:59.999Z'),
    });
  });

  it('passes the branch and status filters through to the query', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = buildService({ order: { findMany } });

    await service.ordersReportCsv({
      branchId: 'br-2',
      status: 'DELIVERED',
      from: '2026-01-01',
      to: '2026-01-31',
    });

    expect(findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ branchId: 'br-2', status: 'DELIVERED' }),
    );
  });

  it('reads every matching row in chunks instead of stopping at a page limit', async () => {
    const total = 2500;
    const findMany = vi.fn().mockImplementation(({ skip, take }: { skip: number; take: number }) =>
      Promise.resolve(
        Array.from({ length: Math.min(take, total - skip) }, (_, i) => ({
          orderNumber: `HB-${skip + i}`,
          placedAt: new Date('2026-01-05T10:00:00.000Z'),
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          subtotalMinor: 100,
          discountMinor: 0,
          deliveryFeeMinor: 0,
          taxMinor: 0,
          totalMinor: 100,
          branch: { name: 'Guntur' },
          items: [{ quantity: 1 }],
          payments: [],
        })),
      ),
    );
    const service = buildService({ order: { findMany } });

    const csv = await service.ordersReportCsv({ from: '2026-01-01', to: '2026-01-31' });

    // Header plus every one of the 2500 rows: nothing is dropped.
    expect(csv.split('\n')).toHaveLength(total + 1);
    expect(csv.split('\n')[1]).toContain('HB-0');
    expect(csv.split('\n')[total]).toContain(`HB-${total - 1}`);
    // Chunked reads advance by skip/take, not a fixed take: 1000.
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(findMany.mock.calls.map((c) => c[0].skip)).toEqual([0, 1000, 2000]);
    expect(findMany.mock.calls[0][0].take).toBe(1000);
  });

  it('neutralises spreadsheet formula injection in text columns', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        orderNumber: 'HB-3',
        placedAt: new Date('2026-01-05T10:00:00.000Z'),
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        subtotalMinor: 100,
        discountMinor: 0,
        deliveryFeeMinor: 0,
        taxMinor: 0,
        totalMinor: 100,
        // Leading `=` would be executed on open; the comma also forces RFC 4180 quoting.
        branch: { name: '=SUM(A1:A9),danger' },
        items: [{ quantity: 1 }],
        payments: [],
      },
    ]);
    const service = buildService({ order: { findMany } });

    const csv = await service.ordersReportCsv({ from: '2026-01-01', to: '2026-01-31' });

    // The leading apostrophe marks the cell as text so a spreadsheet cannot execute it,
    // and the embedded comma keeps the cell quoted.
    expect(csv).toContain(`"'=SUM(A1:A9),danger"`);
    expect(csv.split('\n')[1].startsWith('HB-3,')).toBe(true);
  });

  it('keeps commas, quotes, newlines and unicode intact', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        orderNumber: 'HB-4',
        placedAt: new Date('2026-01-05T10:00:00.000Z'),
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        subtotalMinor: 100,
        discountMinor: 0,
        deliveryFeeMinor: 0,
        taxMinor: 0,
        totalMinor: 100,
        branch: { name: 'Hyderabad, Telangana — "central" વિભાગ' },
        items: [{ quantity: 1 }],
        payments: [],
      },
    ]);
    const service = buildService({ order: { findMany } });

    const csv = await service.ordersReportCsv({ from: '2026-01-01', to: '2026-01-31' });

    expect(csv).toContain('"Hyderabad, Telangana — ""central"" વિભાગ"');
  });

  it('produces a header-only document for an empty result', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = buildService({ order: { findMany } });

    const csv = await service.ordersReportCsv({ from: '2026-01-01', to: '2026-01-31' });

    expect(csv).toBe(
      'orderNumber,placedAtIst,branchName,status,paymentStatus,paymentMethod,itemCount,subtotalMinor,discountMinor,deliveryFeeMinor,taxMinor,totalMinor,collectedAtIst,collectedByRole,collectedById',
    );
  });

  it('emits money in lossless paise without floating-point drift', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        orderNumber: 'HB-5',
        placedAt: new Date('2026-01-05T10:00:00.000Z'),
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        subtotalMinor: 123456789,
        discountMinor: 1,
        deliveryFeeMinor: 0,
        taxMinor: 0,
        totalMinor: 123456788,
        branch: { name: 'Guntur' },
        items: [{ quantity: 1 }],
        payments: [],
      },
    ]);
    const service = buildService({ order: { findMany } });

    const csv = await service.ordersReportCsv({ from: '2026-01-01', to: '2026-01-31' });

    expect(csv).toContain(',123456789,1,0,0,123456788,');
  });
});
