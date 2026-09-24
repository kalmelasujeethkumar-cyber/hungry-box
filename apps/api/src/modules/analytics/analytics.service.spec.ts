import { BadRequestException } from '@nestjs/common';
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

describe('AnalyticsService.dashboard', () => {
  it('aggregates revenue, orders, customers, statuses, methods, delivery, branches and time series', async () => {
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
        findMany: vi.fn().mockResolvedValue([
          { productId: 'p1', productName: 'Biryani', quantity: 2, lineTotalMinor: 20000 },
          { productId: 'p2', productName: 'Spring Roll', quantity: 1, lineTotalMinor: 15000 },
          { productId: 'p1', productName: 'Biryani', quantity: 1, lineTotalMinor: 10000 },
        ]),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([
          { method: 'COD', amountMinor: 10000 },
          { method: 'UPI', amountMinor: 5000 },
          { method: 'COD', amountMinor: 25000 },
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
    expect(result.averageOrderValueMinor).toBe(11667);
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
      { method: 'UPI', count: 1, totalMinor: 5000 },
    ]);
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
      { productId: 'p1', productName: 'Biryani', quantity: 3, revenueMinor: 30000 },
      { productId: 'p2', productName: 'Spring Roll', quantity: 1, revenueMinor: 15000 },
    ]);
    expect(result.timeSeries).toEqual([
      { period: '2026-01', label: 'Jan 2026', orders: 3, revenueMinor: 35000, cancelledOrders: 1 },
    ]);
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
      orderItem: { findMany: vi.fn().mockResolvedValue([]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      deliveryPartnerProfile: { count: vi.fn().mockResolvedValue(0) },
      deliveryAssignment: { findMany: vi.fn().mockResolvedValue([]) },
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
    const db = {
      order: { findMany: vi.fn().mockResolvedValue([]) },
      orderItem: { findMany: vi.fn().mockResolvedValue([]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      deliveryPartnerProfile: { count: vi.fn().mockResolvedValue(0) },
      deliveryAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    };
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

  it('rejects a reversed range', async () => {
    const db = {
      order: { findMany: vi.fn().mockResolvedValue([]) },
      orderItem: { findMany: vi.fn().mockResolvedValue([]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      deliveryPartnerProfile: { count: vi.fn().mockResolvedValue(0) },
      deliveryAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = buildService(db);

    await expect(service.dashboard({ from: '2026-02-01', to: '2026-01-01' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('AnalyticsService.ordersReportCsv', () => {
  it('emits a CSV header and correctly escaped data rows', async () => {
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
      'orderNumber,placedAt,branchName,status,paymentStatus,paymentMethod,itemCount,subtotalMinor,discountMinor,deliveryFeeMinor,taxMinor,totalMinor',
    );
    expect(csv).toContain('"Guntur, Andhra Pradesh"');
    expect(csv).toContain(',3,29900,0,4000,1000,34900');
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          placedAt: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-01-31T23:59:59.999Z'),
          },
        }),
        take: 1000,
      }),
    );
  });
});
