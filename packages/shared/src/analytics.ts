import type { BranchStatus } from './branches';
import type { OrderStatus, PaymentMethod } from './orders';

export type DashboardBucket = 'day' | 'week' | 'month' | 'year';

export interface AdminDashboardQuery {
  branchId?: string;
  from?: string;
  to?: string;
  bucket?: DashboardBucket;
  /**
   * Narrows every order-derived figure to orders in this status: counts, customers,
   * revenue, AOV, the time series, the status breakdown, top products, delivery
   * assignments and cash due. It is the same population the orders-report CSV selects,
   * so a status-filtered screen and its download describe one dataset.
   *
   * Money keeps the Phase 2A accounting rules regardless of this filter: `revenueMinor`
   * and the payment-method totals still count only PAID orders, so selecting a status
   * whose orders are not yet paid legitimately reports zero revenue rather than
   * reinterpreting what "revenue" means.
   *
   * Branch status counts (`activeBranches`, `pausedBranches`, `inactiveBranches`) are
   * branch entities rather than orders, so they ignore this filter.
   */
  status?: OrderStatus;
}

export interface OrderStatusAggregate {
  status: OrderStatus;
  count: number;
  totalMinor: number;
}

export interface PaymentMethodAggregate {
  method: PaymentMethod;
  /** Settled payments of this method. */
  count: number;
  /** Money from those settled payments; reconciles with DashboardSummaryDto.revenueMinor. */
  totalMinor: number;
}

export interface ProductPerformanceAggregate {
  productId: string | null;
  productName: string;
  /** Quantity on paid orders. */
  quantity: number;
  /** Line totals from paid orders. */
  revenueMinor: number;
}

export interface TimeSeriesPoint {
  period: string;
  label: string;
  /** Orders placed in the bucket, including cancelled ones. */
  orders: number;
  /** Money from paid orders in the bucket. */
  revenueMinor: number;
  cancelledOrders: number;
}

export interface DeliverySummaryDto {
  /** Active partners in the selected branch, or across all branches when unfiltered. */
  activePartners: number;
  assigned: number;
  outForDelivery: number;
  delivered: number;
  cancelledOrRejected: number;
}

export interface CodSummaryDto {
  /** Number of orders carrying a COD payment (any status). */
  totalOrders: number;
  /** Number of COD payments collected (Payment status PAID). */
  collectedCount: number;
  /** Total minor amount of collected COD cash. */
  collectedMinor: number;
  /** Number of COD payments not yet collected and not on cancelled orders. */
  uncollectedCount: number;
  /** Total minor amount still due for collection. */
  uncollectedMinor: number;
}

export interface CancellationSummaryDto {
  count: number;
  amountMinor: number;
}

export interface BranchPerformanceDto {
  branchId: string;
  branchName: string;
  status: BranchStatus;
  orders: number;
  revenueMinor: number;
}

export interface DashboardSummaryDto {
  /** Money from orders whose payment reached PAID. */
  revenueMinor: number;
  /**
   * Every order placed in the period, including cancelled ones. Cancellations are
   * reported separately by `cancellations` and `orderStatusBreakdown`, so this stays a
   * count of placed orders rather than a count of successful orders.
   */
  orders: number;
  /** Distinct customers who placed an order in the period. */
  customers: number;
  /** `revenueMinor` divided by the number of paid orders; 0 when there are none. */
  averageOrderValueMinor: number;
  activeBranches: number;
  pausedBranches: number;
  inactiveBranches: number;
  orderStatusBreakdown: OrderStatusAggregate[];
  paymentMethodBreakdown: PaymentMethodAggregate[];
  cancellations: CancellationSummaryDto;
  refunds: CancellationSummaryDto;
  delivery: DeliverySummaryDto;
  cod: CodSummaryDto;
  branchComparison: BranchPerformanceDto[];
  topProducts: ProductPerformanceAggregate[];
  timeSeries: TimeSeriesPoint[];
}

export interface AdminReportQuery {
  branchId?: string;
  from?: string;
  to?: string;
  status?: OrderStatus;
}

export interface OrderReportRow {
  orderNumber: string;
  placedAt: string;
  branchName: string;
  status: OrderStatus;
  paymentStatus: string;
  paymentMethod: string | null;
  itemCount: number;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** When COD cash was collected; null for pre-paid or uncollected COD. */
  collectedAt: string | null;
  collectedByRole: string | null;
  collectedById: string | null;
}
