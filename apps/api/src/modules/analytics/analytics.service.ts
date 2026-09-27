import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  BranchPerformanceDto,
  CodSummaryDto,
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
import {
  businessParts,
  fromBusinessWallMs,
  startOfBusinessDay,
  toBusinessWallMs,
} from '../../common/utils/business-time';
import { buildCsvDocument, type CsvValue } from '../../common/utils/csv';
import { formatBusinessTimestamp } from '../../common/utils/business-time';
import { collectAllForExport } from '../../common/utils/paginated-export';
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
  status: PaymentStatus;
  orderId: string | null;
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
  status: true,
  orderId: true,
} as const;

const assignmentSelect = { status: true } as const;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(query: AdminDashboardQueryDto): Promise<DashboardSummaryDto> {
    const db = this.prisma.requireClient();
    const { from, to } = this.resolveRange(query.from, query.to);

    /**
     * The selected order status narrows the order population, and every order-derived
     * figure below reads from that same population: counts, customers, the time series,
     * the status breakdown, top products, assignments and cash due. Money keeps the Phase
     * 2A rule on top of it - only PAID orders contribute revenue - so a status whose
     * orders are unpaid reports zero revenue instead of redefining what revenue means.
     */
    const statusFilter = query.status ? { status: query.status } : {};
    const parentWhere: Prisma.OrderWhereInput = {
      placedAt: { gte: from, lte: to },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...statusFilter,
    };
    const nestedWhere = {
      order: {
        placedAt: { gte: from, lte: to },
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...statusFilter,
      },
    };
    /**
     * Headline revenue, product performance and payment-method money all describe
     * payments that actually succeeded, so the rows behind those metrics are narrowed
     * to orders whose payment is PAID. `nestedWhere` stays unfiltered because the COD
     * summary needs PENDING rows to report cash still due.
     */
    const paidOrderWhere: Prisma.OrderWhereInput = {
      paymentStatus: 'PAID',
      placedAt: { gte: from, lte: to },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...statusFilter,
    };
    const paidNestedWhere = { order: paidOrderWhere };

    const [orders, items, payments, branches, activePartnerCount, assignments] = await Promise.all([
      db.order.findMany({ where: parentWhere, select: orderSelect, orderBy: { placedAt: 'asc' } }),
      db.orderItem.findMany({ where: paidNestedWhere, select: orderItemSelect }),
      db.payment.findMany({ where: nestedWhere, select: paymentSelect }),
      db.branch.findMany({ select: { id: true, name: true, status: true } }),
      db.deliveryPartnerProfile.count({
        where: {
          status: 'ACTIVE',
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
      }),
      db.deliveryAssignment.findMany({ where: nestedWhere, select: assignmentSelect }),
    ]);

    const ordersTyped = orders as unknown as OrderRow[];
    const itemsTyped = items as unknown as OrderItemRow[];
    const paymentsTyped = payments as unknown as PaymentRow[];
    const assignmentsTyped = assignments as unknown as AssignmentRow[];

    const paidOrders = ordersTyped.filter((order) => order.paymentStatus === 'PAID');
    const paidTotal = paidOrders.reduce((sum, order) => sum + order.totalMinor, 0);

    const bucket = this.resolveBucket(query.bucket, from, to);

    return {
      revenueMinor: paidTotal,
      orders: ordersTyped.length,
      customers: new Set(ordersTyped.map((order) => order.customerId)).size,
      averageOrderValueMinor:
        paidOrders.length > 0 ? Math.round(paidTotal / paidOrders.length) : 0,
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
      cod: this.codSummary(paymentsTyped, ordersTyped),
      branchComparison: this.branchComparison(ordersTyped, branches),
      topProducts: this.topProducts(itemsTyped),
      timeSeries: this.buildTimeSeries(ordersTyped, from, to, bucket),
    };
  }

  /**
   * Orders report export.
   *
   * Reads every matching order in bounded chunks rather than a single `take`, so a report
   * can no longer be silently cut short at 1000 rows. Row order is newest-first by
   * `placedAt` with `id` as a tiebreaker, which is a total order and therefore stable
   * across the chunked reads. The selected `status` narrows the same order population the
   * on-screen report uses, so the file and the screen describe one dataset.
   */
  async ordersReportCsv(query: AdminReportQueryDto): Promise<string> {
    const db = this.prisma.requireClient();
    const { from, to } = this.resolveRange(query.from, query.to);

    const where: Prisma.OrderWhereInput = {
      placedAt: { gte: from, lte: to },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const rows = await collectAllForExport<OrderReportRow>(
      ({ skip, take }) =>
        db.order.findMany({
          where,
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
            payments: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                method: true,
                collectedAt: true,
                collectedByRole: true,
                collectedById: true,
              },
            },
          },
          orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        }) as Promise<OrderReportRow[]>,
      'orders',
    );

    return buildCsvDocument(ORDER_REPORT_HEADER, toOrderReportRows(rows));
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

  /**
   * Money actually collected, grouped by method, so the totals reconcile with
   * `revenueMinor`. PENDING, AUTHORIZED, FAILED, CANCELLED and REFUNDED payments are
   * excluded here; the COD summary reports the uncollected ones separately.
   */
  private paymentMethodBreakdown(payments: PaymentRow[]): PaymentMethodAggregate[] {
    const map = new Map<PaymentMethod, PaymentMethodAggregate>();
    for (const payment of payments) {
      if (payment.status !== 'PAID') continue;
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

  /**
   * Cancellations counts cancelled orders and their gross order value. Refunds counts
   * orders whose payment reached REFUNDED and their gross order value; the schema stores
   * no partial refund amount, so the order total is the only available figure. Whether
   * these should instead be net of refunds, or measured per refund transaction, is a
   * business decision and is deliberately left unchanged here.
   */
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

  /**
   * Cash on delivery accounting. Amounts come from COD payment rows (which equal
   * the server-computed order totals). Uncollected amounts never include
   * cancelled orders, so a cancelled COD order cannot inflate money due.
   */
  private codSummary(payments: PaymentRow[], orders: OrderRow[]): CodSummaryDto {
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const visitedOrders = new Set<string>();
    let totalOrders = 0;
    let collectedCount = 0;
    let collectedMinor = 0;
    let uncollectedCount = 0;
    let uncollectedMinor = 0;

    for (const payment of payments) {
      if (payment.method !== 'COD') continue;
      if (payment.orderId && !visitedOrders.has(payment.orderId)) {
        visitedOrders.add(payment.orderId);
        totalOrders += 1;
      }
      if (payment.status === 'PAID') {
        collectedCount += 1;
        collectedMinor += payment.amountMinor;
        continue;
      }
      const order = payment.orderId ? orderById.get(payment.orderId) : undefined;
      if (!order || order.status === 'CANCELLED') continue;
      uncollectedCount += 1;
      uncollectedMinor += payment.amountMinor;
    }

    return {
      totalOrders,
      collectedCount,
      collectedMinor,
      uncollectedCount,
      uncollectedMinor,
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
    const start = this.startOfDay(date);
    if (bucket === 'week') {
      const weekday = new Date(toBusinessWallMs(start)).getUTCDay();
      return new Date(start.getTime() - ((weekday + 6) % 7) * DAY_MS);
    }
    const { year, month } = businessParts(date);
    if (bucket === 'month') return fromBusinessWallMs(Date.UTC(year, month, 1));
    return fromBusinessWallMs(Date.UTC(year, 0, 1));
  }

  private nextBucket(date: Date, bucket: DashboardBucket): Date {
    if (bucket === 'day') return new Date(date.getTime() + DAY_MS);
    if (bucket === 'week') return new Date(date.getTime() + 7 * DAY_MS);
    const { year, month } = businessParts(date);
    if (bucket === 'month') return fromBusinessWallMs(Date.UTC(year, month + 1, 1));
    return fromBusinessWallMs(Date.UTC(year + 1, 0, 1));
  }

  private bucketKey(date: Date, bucket: DashboardBucket): string {
    if (bucket === 'day') {
      return new Date(toBusinessWallMs(date)).toISOString().slice(0, 10);
    }
    if (bucket === 'week') {
      return new Date(toBusinessWallMs(this.bucketStart(date, 'week'))).toISOString().slice(0, 10);
    }
    const { year, month } = businessParts(date);
    if (bucket === 'month') return `${year}-${String(month + 1).padStart(2, '0')}`;
    return String(year);
  }

  private labelFor(date: Date, bucket: DashboardBucket): string {
    if (bucket === 'day') {
      const { day, month } = businessParts(date);
      return `${day} ${MONTHS[month]}`;
    }
    if (bucket === 'week') {
      const { day, month } = businessParts(this.bucketStart(date, 'week'));
      return `Week of ${day} ${MONTHS[month]}`;
    }
    const { year, month } = businessParts(date);
    if (bucket === 'month') return `${MONTHS[month]} ${year}`;
    return String(year);
  }

  /** 00:00:00.000 business time on the calendar day containing `date`. */
  private startOfDay(date: Date): Date {
    return startOfBusinessDay(date);
  }

  /** 23:59:59.999 business time on the calendar day containing `date`. */
  private endOfDay(date: Date): Date {
    return new Date(this.startOfDay(date).getTime() + DAY_MS - 1);
  }
}

/**
 * Column order for the orders report. This is an explicit list rather than an object
 * spread, so the exported column order can never drift with property insertion order.
 */
const ORDER_REPORT_HEADER = [
  'orderNumber',
  'placedAtIst',
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
  'collectedAtIst',
  'collectedByRole',
  'collectedById',
] as const;

type OrderReportRow = {
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
  payments: Array<{
    method: PaymentMethod;
    collectedAt: Date | null;
    collectedByRole: string | null;
    collectedById: string | null;
  }>;
};

function toOrderReportRows(rows: ReadonlyArray<OrderReportRow>): CsvValue[][] {
  return rows.map((row) => {
    // One order can carry several payment rows (for example after a retry). The query
    // already picks a single deterministic payment, so this is a total function.
    const payment = row.payments[0];
    return [
      row.orderNumber,
      formatBusinessTimestamp(row.placedAt),
      row.branch.name,
      row.status,
      row.paymentStatus,
      payment?.method ?? '',
      row.items.reduce((sum, item) => sum + item.quantity, 0),
      row.subtotalMinor,
      row.discountMinor,
      row.deliveryFeeMinor,
      row.taxMinor,
      row.totalMinor,
      payment?.collectedAt ? formatBusinessTimestamp(payment.collectedAt) : '',
      payment?.collectedByRole ?? '',
      payment?.collectedById ?? '',
    ];
  });
}
