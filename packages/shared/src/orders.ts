import type { CartBranch } from './cart';

export const ORDER_STATUSES = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CUSTOMER_ORDER_FILTERS = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'CANCELLED',
] as const;

export type CustomerOrderFilter = (typeof CUSTOMER_ORDER_FILTERS)[number];

export const ORDER_STATUS_STEP = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export type OrderStatusStep = (typeof ORDER_STATUS_STEP)[number];

export const PAYMENT_METHODS = ['UPI', 'CARD', 'NET_BANKING', 'WALLET', 'COD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface CheckoutAddressDto {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string | null;
  houseFlat: string;
  streetArea: string;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  deliveryInstructions: string | null;
}

export interface CheckoutLineItemDto {
  branchProductId: string;
  productId: string;
  productName: string;
  categoryName: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  unitDiscountMinor: number;
  unitEffectivePriceMinor: number;
  lineSubtotalMinor: number;
  lineDiscountMinor: number;
  lineTotalMinor: number;
}

export interface PriceChangeWarning {
  productId: string;
  productName: string;
  fromUnitPriceMinor: number;
  toUnitPriceMinor: number;
  fromUnitDiscountMinor: number;
  toUnitDiscountMinor: number;
}

export interface UnavailableItemWarning {
  productId: string;
  productName: string;
  reason: string;
}

export type CheckoutPreviewStatus = 'ok' | 'unavailable' | 'unserviceable';

export interface CheckoutPreviewDto {
  branch: CartBranch;
  address: CheckoutAddressDto;
  status: CheckoutPreviewStatus;
  issues: string[];
  items: CheckoutLineItemDto[];
  unavailableItems: UnavailableItemWarning[];
  priceChanges: PriceChangeWarning[];
  serviceable: boolean;
  distanceKm: number | null;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  itemCount: number;
  needsConfirmation: boolean;
  availablePaymentMethods: PaymentMethod[];
}

export interface CheckoutPreviewInput {
  addressId: string;
}

export interface CreatePaymentIntentInput {
  addressId: string;
  method: PaymentMethod;
}

export interface PaymentIntentDto {
  paymentId: string;
  provider: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
}

export interface VerifyPaymentInput {
  paymentId: string;
}

export interface VerifyPaymentResultDto {
  paymentId: string;
  providerPaymentId: string;
  verified: boolean;
  status: PaymentStatus;
  failureReason: string | null;
}

export interface DevPaymentSimulateInput {
  providerPaymentId: string;
  outcome: 'success' | 'failure';
}

export interface OrderItemDto {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
  unitDiscountMinor: number;
  unitEffectivePriceMinor: number;
  lineSubtotalMinor: number;
  lineDiscountMinor: number;
  lineTotalMinor: number;
}

export interface OrderAddressDto {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string | null;
  houseFlat: string;
  streetArea: string;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  deliveryInstructions: string | null;
}

export interface OrderEventDto {
  id: string;
  kind: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  actorRole: string | null;
  at: string;
}

export interface OrderPaymentDto {
  id: string;
  provider: string;
  providerPaymentId: string;
  providerOrderId: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  /** When the cash was collected for COD payments; null otherwise. */
  collectedAt: string | null;
  /** Role of the actor who collected COD cash; null unless collected. */
  collectedByRole: string | null;
  /** ID of the actor who collected COD cash; hidden from customers. */
  collectedById: string | null;
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  branch: CartBranch;
  itemCount: number;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  placedAt: string;
  cancelledAt: string | null;
}

export interface OrderDetailDto extends OrderSummaryDto {
  items: OrderItemDto[];
  address: OrderAddressDto | null;
  payments: OrderPaymentDto[];
  events: OrderEventDto[];
}

export interface CreateOrderInput {
  paymentId: string;
  idempotencyKey: string;
  addressId: string;
  notes?: string;
}

/** Cash-on-delivery order placement. No payment is captured up front. */
export interface CreateCodOrderInput {
  idempotencyKey: string;
  addressId: string;
  notes?: string;
}

export interface CancelOrderInput {
  reason?: string;
}

export interface BranchOrderListQuery {
  branchId?: string;
  status?: OrderStatus;
  from?: string;
  to?: string;
}

export type BranchAdvanceStatus = Extract<
  OrderStatus,
  'CONFIRMED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED'
>;

export interface BranchOrderStatusInput {
  status: BranchAdvanceStatus;
}
