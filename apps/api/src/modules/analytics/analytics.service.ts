import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  BranchPerformanceDto,
  DashboardBucket,
  DashboardSummaryDto,
  DeliverySummaryDto,
  OrderStatusAggregate,
  OrderStatus,
  PaymentMethod,
  PaymentMethodAggregate,
  PaymentStatus,
  ProductPerformanceAggregate,
  TimeSeriesPoint,
  BranchStatus,
} from '@hungrybox/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminDashboardQueryDto } from './dto/admin-dashboard-query.dto';
import type { AdminReportQueryDto } from './dto/admin-report-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SERIES_POINTS = 366;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface OrderRow {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  branchId: string;
  customerId: string;
  totalMinor: number;
  placedAt: Date;
}

interface OrderItemRow {
  productId: string | null;
  productName: string;
  quantity: number;
  lineTotalMinor: number;
}

interface PaymentRow {
  method: PaymentMethod;
  amountMinor: number;
}

interface AssignmentRow {
  status: string;
}

const orderSelect = {
  id: true,
  status: true,
  paymentStatus: true,
  branchId: true,
  customerId: true,
  totalMinor: true,
  placedAt: true,
} as const;

const orderItemSelect = {
  productId: true,
  productName: true,
  quantity: true,
  lineTotalMinor: true,
} as const;

const paymentSelect = {
  method: true,
  amountMinor: true,
} as const;

const assignmentSelect = { status: true } as const;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(query: AdminDashboardQueryDto): Promise<DashboardSummaryDto> {
    const db = this.prisma.requireClient();
    const { from, to } = this.resolveRange(query.from, query.to);

    const parentWhere: Prisma.OrderWhereInput = {
      placedAt: { gte: from, lte: to },
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };
    const nestedWhere = {
      order: {
        placedAt: { gte: from, lte: to },
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
    };

    const [orders, items, payments, branches, activePartnerCount, assignments] = await Promise.all([
      db.order.findMany({ where: parentWhere, select: orderSelect, orderBy: { placedAt: 'asc' } }),
      db.orderItem.findMany({ where: nestedWhere, select: orderItemSelect }),
      db.payment.findMany({ where: nestedWhere, select: paymentSelect }),
      db.branch.findMany({ select: { id: true, name: true, status: true } }),
      db.deliveryPartnerProfile.count({ where: { status: 'ACTIVE' } }),
      db.deliveryAssignment.findMany({ where: nestedWhere, select: assignmentSelect }),
    ]);

    const ordersTyped = orders as unknown as OrderRow[];
    const itemsTyped = items as unknown as OrderItemRow[];
    const paymentsTyped = payments as unknown as PaymentRow[];
    const assignmentsTyped = assignments as unknown as AssignmentRow[];

    const paidTotal = ordersTyped
      .filter((order) => order.paymentStatus === 'PAID')
      .reduce((sum, order) => sum + order.totalMinor, 0);

    const bucket = this.resolveBucket(query.bucket, from, to);

    return {
      revenueMinor: paidTotal,
      orders: ordersTyped.length,
      customers: new Set(ordersTyped.map((order) => order.customerId)).size,
      averageOrderValueMinor:
        ordersTyped.length > 0 ? Math.round(paidTotal / ordersTyped.length) : 0,
      activeBranches: branches.filter((branch) => branch.status === 'ACTIVE').length,
      pausedBranches: branches.filter((branch) => branch.status === 'PAUSED').length,
      inactiveBranches: branches.filter((branch) => branch.status === 'INACTIVE').length,
      orderStatusBreakdown: this.orderStatusBreakdown(ordersTyped),
      paymentMethodBreakdown: this.paymentMethodBreakdown(paymentsTyped),
      cancellations: this.cancellationSummary(
        ordersTyped.filter((order) => order.status === 'CANCELLED'),
      ),
      refunds: this.cancellationSummary(
        ordersTyped.filter((order) => order.paymentStatus === 'REFUNDED'),
      ),
      delivery: this.deliverySummary(assignmentsTyped, activePartnerCount),
      branchComparison: this.branchComparison(ordersTyped, branches),
      topProducts: this.topProducts(itemsTyped),
      timeSeries: this.buildTimeSeries(ordersTyped, from, to, bucket),
    };
  }

  async ordersReportCsv(query: AdminReportQueryDto): Promise<string> {
    const db = this.prisma.requireClient();
    const { from, to } = this.resolveRange(query.from, query.to);

    const rows = await db.order.findMany({
      where: {
        placedAt: { gte: from, lte: to },
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { placedAt: 'desc' },
      take: 1000,
      select: {
        orderNumber: true,
        placedAt: true,
        status: true,
        paymentStatus: true,
        subtotalMinor: true,
        discountMinor: true,
        deliveryFeeMinor: true,
        taxMinor: true,
        totalMinor: true,
        branch: { select: { name: true } },
        items: { select: { quantity: true } },
        payments: { select: { method: true }, take: 1 },
      },
    });

    return toOrderCsv(rows);
  }

  private resolveRange(fromRaw?: string, toRaw?: string): { from: Date; to: Date } {
    const now = new Date();
    const parsedFrom = fromRaw ? new Date(fromRaw) : null;
    const parsedTo = toRaw ? new Date(toRaw) : null;
    const from =
      parsedFrom && !Number.isNaN(parsedFrom.getTime())
        ? this.startOfDay(parsedFrom)
        : new Date(now.getTime() - 29 * DAY_MS);
    const to = parsedTo && !Number.isNaN(parsedTo.getTime()) ? this.endOfDay(parsedTo) : now;
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from cannot be after to');
    }
    return { from, to };
  }

  private orderStatusBreakdown(orders: OrderRow[]): OrderStatusAggregate[] {
    const map = new Map<OrderStatus, OrderStatusAggregate>();
    for (const order of orders) {
      const entry = map.get(order.status) ?? { status: order.status, count: 0, totalMinor: 0 };
      entry.count += 1;
      entry.totalMinor += order.totalMinor;
      map.set(order.status, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  private paymentMethodBreakdown(payments: PaymentRow[]): PaymentMethodAggregate[] {
    const map = new Map<PaymentMethod, PaymentMethodAggregate>();
    for (const payment of payments) {
      const entry = map.get(payment.method) ?? {
        method: payment.method,
        count: 0,
        totalMinor: 0,
      };
      entry.count += 1;
      entry.totalMinor += payment.amountMinor;
      map.set(payment.method, entry);
    }
    return [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor);
  }

  private cancellationSummary(orders: OrderRow[]): { count: number; amountMinor: number } {
    return {
      count: orders.length,
      amountMinor: orders.reduce((sum, order) => sum + order.totalMinor, 0),
    };
  }

  private deliverySummary(
    assignments: AssignmentRow[],
    activePartners: number,
  ): DeliverySummaryDto {
    const count = (statuses: string[]): number =>
      assignments.filter((assignment) => statuses.includes(assignment.status)).length;
    return {
      activePartners,
      assigned: count(['ASSIGNED', 'ACCEPTED']),
      outForDelivery: count(['PICKED_UP', 'OUT_FOR_DELIVERY']),
      delivered: count(['DELIVERED']),
      cancelledOrRejected: count(['CANCELLED', 'REJECTED']),
    };
  }

  private branchComparison(
    orders: OrderRow[],
    branches: Array<{ id: string; name: string; status: BranchStatus }>,
  ): BranchPerformanceDto[] {
    const byBranch = new Map<string, { orders: number; revenueMinor: number }>();
    for (const order of orders) {
      const entry = byBranch.get(order.branchId) ?? { orders: 0, revenueMinor: 0 };
      entry.orders += 1;
      if (order.paymentStatus === 'PAID') {
        entry.revenueMinor += order.totalMinor;
      }
      byBranch.set(order.branchId, entry);
    }
    return branches.map((branch) => {
      const entry = byBranch.get(branch.id) ?? { orders: 0, revenueMinor: 0 };
      return {
        branchId: branch.id,
        branchName: branch.name,
        status: branch.status,
        orders: entry.orders,
        revenueMinor: entry.revenueMinor,
      };
    });
  }

  private topProducts(items: OrderItemRow[]): ProductPerformanceAggregate[] {
    const map = new Map<string, ProductPerformanceAggregate>();
    for (const item of items) {
      const key = item.productId ?? `name:${item.productName}`;
      const productName = item.productName ?? 'Unknown product';
      const entry = map.get(key) ?? {
        productId: item.productId,
        productName,
        quantity: 0,
        revenueMinor: 0,
      };
      entry.quantity += item.quantity;
      entry.revenueMinor += item.lineTotalMinor;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, 5);
  }

  private resolveBucket(
    requested: DashboardBucket | undefined,
    from: Date,
    to: Date,
  ): DashboardBucket {
    if (requested) {
      return this.coarsenIfNeeded(requested, from, to);
    }
    const days = (to.getTime() - from.getTime()) / DAY_MS;
    if (days <= 92) return 'day';
    if (days <= 730) return 'month';
    return 'year';
  }

  private coarsenIfNeeded(bucket: DashboardBucket, from: Date, to: Date): DashboardBucket {
    if (this.periodCount(from, to, bucket) <= MAX_SERIES_POINTS) return bucket;
    if (bucket === 'week')
      return this.periodCount(from, to, 'month') <= MAX_SERIES_POINTS ? 'month' : 'year';
    if (bucket === 'day') {
      if (this.periodCount(from, to, 'week') <= MAX_SERIES_POINTS) return 'week';
      return this.periodCount(from, to, 'month') <= MAX_SERIES_POINTS ? 'month' : 'year';
    }
    if (bucket === 'month') return 'year';
    return bucket;
  }

  private periodCount(from: Date, to: Date, bucket: DashboardBucket): number {
    return this.periodsForRange(from, to, bucket).length;
  }

  private buildTimeSeries(
    orders: OrderRow[],
    from: Date,
    to: Date,
    bucket: DashboardBucket,
  ): TimeSeriesPoint[] {
    const totals = new Map<
      string,
      { orders: number; revenueMinor: number; cancelledOrders: number }
    >();
    for (const order of orders) {
      const key = this.bucketKey(order.placedAt, bucket);
      const entry = totals.get(key) ?? { orders: 0, revenueMinor: 0, cancelledOrders: 0 };
      entry.orders += 1;
      if (order.paymentStatus === 'PAID') {
        entry.revenueMinor += order.totalMinor;
      }
      if (order.status === 'CANCELLED') {
        entry.cancelledOrders += 1;
      }
      totals.set(key, entry);
    }
    return this.periodsForRange(from, to, bucket).map((period) => {
      const entry = totals.get(period.key) ?? { orders: 0, revenueMinor: 0, cancelledOrders: 0 };
      return { period: period.key, label: period.label, ...entry };
    });
  }

  private periodsForRange(
    from: Date,
    to: Date,
    bucket: DashboardBucket,
  ): Array<{ key: string; label: string }> {
    const periods: Array<{ key: string; label: string }> = [];
    let cursor = this.bucketStart(from, bucket);
    let guard = 0;
    while (cursor.getTime() <= to.getTime() && guard < MAX_SERIES_POINTS + 12) {
      periods.push({ key: this.bucketKey(cursor, bucket), label: this.labelFor(cursor, bucket) });
      cursor = this.nextBucket(cursor, bucket);
      guard += 1;
    }
    return periods;
  }

  private bucketStart(date: Date, bucket: DashboardBucket): Date {
    if (bucket === 'day') return this.startOfDay(date);
    if (bucket === 'week') {
      const day = this.startOfDay(date);
      const shift = (day.getUTCDay() + 6) % 7;
      return new Date(day.getTime() - shift * DAY_MS);
    }
    if (bucket === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  }

  private nextBucket(date: Date, bucket: DashboardBucket): Date {
    if (bucket === 'day') return new Date(date.getTime() + DAY_MS);
    if (bucket === 'week') return new Date(date.getTime() + 7 * DAY_MS);
    if (bucket === 'month')
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
  }

  private bucketKey(date: Date, bucket: DashboardBucket): string {
    if (bucket === 'day') {
      return date.toISOString().slice(0, 10);
    }
    if (bucket === 'week') {
      return this.bucketStart(date, 'week').toISOString().slice(0, 10);
    }
    if (bucket === 'month') {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    return String(date.getUTCFullYear());
  }

  private labelFor(date: Date, bucket: DashboardBucket): string {
    if (bucket === 'day') {
      return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
    }
    if (bucket === 'week') {
      return `Week of ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
    }
    if (bucket === 'month') {
      return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    }
    return String(date.getUTCFullYear());
  }

  private startOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private endOfDay(date: Date): Date {
    const day = this.startOfDay(date);
    return new Date(day.getTime() + DAY_MS - 1);
  }
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toOrderCsv(
  rows: ReadonlyArray<{
    orderNumber: string;
    placedAt: Date;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    subtotalMinor: number;
    discountMinor: number;
    deliveryFeeMinor: number;
    taxMinor: number;
    totalMinor: number;
    branch: { name: string };
    items: Array<{ quantity: number }>;
    payments: Array<{ method: PaymentMethod }>;
  }>,
): string {
  const header = [
    'orderNumber',
    'placedAt',
    'branchName',
    'status',
    'paymentStatus',
    'paymentMethod',
    'itemCount',
    'subtotalMinor',
    'discountMinor',
    'deliveryFeeMinor',
    'taxMinor',
    'totalMinor',
  ];
  const lines = rows.map((row) =>
    [
      row.orderNumber,
      row.placedAt.toISOString(),
      row.branch.name,
      row.status,
      row.paymentStatus,
      row.payments[0]?.method ?? '',
      String(row.items.reduce((sum, item) => sum + item.quantity, 0)),
      String(row.subtotalMinor),
      String(row.discountMinor),
      String(row.deliveryFeeMinor),
      String(row.taxMinor),
      String(row.totalMinor),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\n');
}
