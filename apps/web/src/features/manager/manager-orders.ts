import type { OrderStatus } from '@hungrybox/shared';

export const ORDER_STATUS_FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'PLACED', label: 'Placed' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

const STAFF_ADVANCE: Partial<Record<OrderStatus, OrderStatus>> = {
  PLACED: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY_FOR_PICKUP',
  READY_FOR_PICKUP: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

const STAFF_CANCELLABLE: readonly OrderStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
];

export function staffAdvanceTarget(status: OrderStatus): OrderStatus | null {
  return STAFF_ADVANCE[status] ?? null;
}

export function staffCancellable(status: OrderStatus): boolean {
  return STAFF_CANCELLABLE.includes(status);
}

export function nextStatusLabel(status: OrderStatus): string | null {
  const target = staffAdvanceTarget(status);
  if (!target) return null;
  const labels: Record<OrderStatus, string> = {
    PLACED: 'Confirm order',
    CONFIRMED: 'Start preparing',
    PREPARING: 'Mark ready',
    READY_FOR_PICKUP: 'Hand to partner',
    OUT_FOR_DELIVERY: 'Mark delivered',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  };
  return labels[status];
}
