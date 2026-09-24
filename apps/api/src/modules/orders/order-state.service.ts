import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrderStatus } from '@hungrybox/shared';

const STAFF_TRANSITIONS: ReadonlyArray<{ from: OrderStatus; to: OrderStatus }> = [
  { from: 'PLACED', to: 'CONFIRMED' },
  { from: 'CONFIRMED', to: 'PREPARING' },
  { from: 'PREPARING', to: 'READY_FOR_PICKUP' },
  { from: 'READY_FOR_PICKUP', to: 'OUT_FOR_DELIVERY' },
  { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED' },
];

const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ['PLACED', 'CONFIRMED'];
const STAFF_CANCELLABLE: readonly OrderStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
];

const STATUS_TIMESTAMP_FIELD: Record<string, string> = {
  CONFIRMED: 'confirmedAt',
  PREPARING: 'preparingAt',
  READY_FOR_PICKUP: 'readyAt',
  OUT_FOR_DELIVERY: 'outForDeliveryAt',
  DELIVERED: 'deliveredAt',
};

@Injectable()
export class OrderStateService {
  assertAdvance(from: OrderStatus, to: OrderStatus): void {
    if (from === 'CANCELLED' || from === 'DELIVERED') {
      throw new BadRequestException(`A ${from.toLowerCase()} order cannot change status`);
    }
    if (!STAFF_TRANSITIONS.some((step) => step.from === from && step.to === to)) {
      throw new BadRequestException(`Order cannot move from ${from} to ${to}`);
    }
  }

  assertCustomerCancellable(status: OrderStatus): void {
    if (!CUSTOMER_CANCELLABLE.includes(status)) {
      throw new BadRequestException('This order can no longer be cancelled');
    }
  }

  assertStaffCancellable(status: OrderStatus): void {
    if (!STAFF_CANCELLABLE.includes(status)) {
      throw new BadRequestException('This order can no longer be cancelled');
    }
  }

  timestampFieldFor(status: OrderStatus): string | null {
    return STATUS_TIMESTAMP_FIELD[status] ?? null;
  }
}
