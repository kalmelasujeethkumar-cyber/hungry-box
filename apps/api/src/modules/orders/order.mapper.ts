import type {
  OrderDetailDto,
  OrderEventDto,
  OrderItemDto,
  OrderSummaryDto,
} from '@hungrybox/shared';
import type { Prisma } from '../../generated/prisma/client';

export const orderSummarySelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  branch: { select: { id: true, name: true, code: true, city: true } },
  items: { select: { quantity: true } },
  payments: { orderBy: { createdAt: 'asc' } as const, take: 1, select: { method: true } },
  subtotalMinor: true,
  discountMinor: true,
  deliveryFeeMinor: true,
  taxMinor: true,
  totalMinor: true,
  placedAt: true,
  cancelledAt: true,
} as const;

export type OrderSummarySource = Prisma.OrderGetPayload<{ select: typeof orderSummarySelect }>;

export const orderDetailSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  branch: { select: { id: true, name: true, code: true, city: true } },
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      quantity: true,
      unitPriceMinor: true,
      unitDiscountMinor: true,
      lineSubtotalMinor: true,
      lineDiscountMinor: true,
      lineTotalMinor: true,
    },
  },
  address: true,
  payments: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      provider: true,
      providerPaymentId: true,
      providerOrderId: true,
      method: true,
      status: true,
      amountMinor: true,
      currency: true,
      collectedAt: true,
      collectedByRole: true,
      collectedById: true,
    },
  },
  events: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kind: true,
      fromStatus: true,
      toStatus: true,
      actorRole: true,
      createdAt: true,
    },
  },
  subtotalMinor: true,
  discountMinor: true,
  deliveryFeeMinor: true,
  taxMinor: true,
  totalMinor: true,
  placedAt: true,
  cancelledAt: true,
} as const;

export type OrderDetailSource = Prisma.OrderGetPayload<{ select: typeof orderDetailSelect }>;

export function toOrderSummary(order: OrderSummarySource): OrderSummaryDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.payments?.[0]?.method ?? null,
    branch: {
      id: order.branch.id,
      name: order.branch.name,
      code: order.branch.code,
      city: order.branch.city,
    },
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalMinor: order.subtotalMinor,
    discountMinor: order.discountMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    taxMinor: order.taxMinor,
    totalMinor: order.totalMinor,
    placedAt: order.placedAt.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
  };
}

export interface OrderDetailMapperOptions {
  /** Exposes the collector's user id for staff views. Always hidden from customers. */
  includeCollectorId?: boolean;
}

export function toOrderDetail(
  order: OrderDetailSource,
  options: OrderDetailMapperOptions = {},
): OrderDetailDto {
  return {
    ...toOrderSummary(order),
    items: order.items.map(toOrderItem),
    address:
      order.address == null
        ? null
        : {
            id: order.address.id,
            label: order.address.label,
            recipientName: order.address.recipientName,
            phone: order.address.phone,
            houseFlat: order.address.houseFlat,
            streetArea: order.address.streetArea,
            landmark: order.address.landmark,
            city: order.address.city,
            state: order.address.state,
            postalCode: order.address.postalCode,
            latitude: order.address.latitude == null ? null : Number(order.address.latitude),
            longitude: order.address.longitude == null ? null : Number(order.address.longitude),
            deliveryInstructions: order.address.deliveryInstructions,
          },
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      providerOrderId: payment.providerOrderId,
      method: payment.method,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      collectedAt: toIso(payment.collectedAt),
      collectedByRole: payment.collectedByRole ?? null,
      collectedById: options.includeCollectorId ? (payment.collectedById ?? null) : null,
    })),
    events: order.events.map(toOrderEvent),
  };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

export function toOrderItem(item: OrderDetailSource['items'][number]): OrderItemDto {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    unitDiscountMinor: item.unitDiscountMinor,
    unitEffectivePriceMinor: item.unitPriceMinor - item.unitDiscountMinor,
    lineSubtotalMinor: item.lineSubtotalMinor,
    lineDiscountMinor: item.lineDiscountMinor,
    lineTotalMinor: item.lineTotalMinor,
  };
}

export function toOrderEvent(event: OrderDetailSource['events'][number]): OrderEventDto {
  return {
    id: event.id,
    kind: event.kind,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorRole: event.actorRole,
    at: event.createdAt.toISOString(),
  };
}
