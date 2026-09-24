import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OrderStateService } from './order-state.service';

const service = new OrderStateService();

describe('OrderStateService.assertAdvance', () => {
  it.each([
    ['PLACED', 'CONFIRMED'],
    ['CONFIRMED', 'PREPARING'],
    ['PREPARING', 'READY_FOR_PICKUP'],
    ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'],
    ['OUT_FOR_DELIVERY', 'DELIVERED'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(() => service.assertAdvance(from, to)).not.toThrow();
  });

  it.each([
    ['PLACED', 'PREPARING'],
    ['PLACED', 'DELIVERED'],
    ['CONFIRMED', 'READY_FOR_PICKUP'],
    ['READY_FOR_PICKUP', 'CONFIRMED'],
  ] as const)('rejects the out-of-order jump %s -> %s', (from, to) => {
    expect(() => service.assertAdvance(from, to)).toThrow(BadRequestException);
  });

  it('rejects any change once delivered', () => {
    expect(() => service.assertAdvance('DELIVERED', 'OUT_FOR_DELIVERY')).toThrow(
      BadRequestException,
    );
  });

  it('rejects any change once cancelled', () => {
    expect(() => service.assertAdvance('CANCELLED', 'CONFIRMED')).toThrow(BadRequestException);
  });
});

describe('OrderStateService cancellation rules', () => {
  it.each(['PLACED', 'CONFIRMED'] as const)('customer may cancel a %s order', (status) => {
    expect(() => service.assertCustomerCancellable(status)).not.toThrow();
  });

  it.each(['PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const)(
    'customer may not cancel a %s order',
    (status) => {
      expect(() => service.assertCustomerCancellable(status)).toThrow(BadRequestException);
    },
  );

  it.each(['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'] as const)(
    'staff may cancel a %s order',
    (status) => {
      expect(() => service.assertStaffCancellable(status)).not.toThrow();
    },
  );

  it.each(['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const)(
    'staff may not cancel a %s order',
    (status) => {
      expect(() => service.assertStaffCancellable(status)).toThrow(BadRequestException);
    },
  );
});

describe('OrderStateService.timestampFieldFor', () => {
  it.each([
    ['CONFIRMED', 'confirmedAt'],
    ['PREPARING', 'preparingAt'],
    ['READY_FOR_PICKUP', 'readyAt'],
    ['OUT_FOR_DELIVERY', 'outForDeliveryAt'],
    ['DELIVERED', 'deliveredAt'],
  ] as const)('maps %s to %s', (status, field) => {
    expect(service.timestampFieldFor(status)).toBe(field);
  });

  it('returns null for PLACED (no timestamp column)', () => {
    expect(service.timestampFieldFor('PLACED')).toBeNull();
  });
});
