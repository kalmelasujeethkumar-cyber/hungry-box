import type { BranchStatus } from './branches';
import type { OrderStatus, PaymentMethod } from './orders';

export type DashboardBucket = 'day' | 'week' | 'month' | 'year';

export interface AdminDashboardQuery {
  branchId?: string;
  from?: string;
  to?: string;
  bucket?: DashboardBucket;
}

export interface OrderStatusAggregate {
  status: OrderStatus;
  count: number;
  totalMinor: number;
}

export interface PaymentMethodAggregate {
  method: PaymentMethod;
  count: number;
  totalMinor: number;
}

export interface ProductPerformanceAggregate {
  productId: string | null;
  productName: string;
  quantity: number;
  revenueMinor: number;
}

export interface TimeSeriesPoint {
  period: string;
  label: string;
  orders: number;
  revenueMinor: number;
  cancelledOrders: number;
}

export interface DeliverySummaryDto {
  activePartners: number;
  assigned: number;
  outForDelivery: number;
  delivered: number;
  cancelledOrRejected: number;
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
  revenueMinor: number;
  orders: number;
  customers: number;
  averageOrderValueMinor: number;
  activeBranches: number;
  pausedBranches: number;
  inactiveBranches: number;
  orderStatusBreakdown: OrderStatusAggregate[];
  paymentMethodBreakdown: PaymentMethodAggregate[];
  cancellations: CancellationSummaryDto;
  refunds: CancellationSummaryDto;
  delivery: DeliverySummaryDto;
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
}
