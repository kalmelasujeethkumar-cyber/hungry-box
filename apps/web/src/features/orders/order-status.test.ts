import { describe, expect, it } from 'vitest';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@hungrybox/shared';
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  isCustomerCancellable,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STEPS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from './order-status';

const ALL_STATUSES: OrderStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

describe('order-status helpers', () => {
  it('labels every shared order status', () => {
    for (const status of ALL_STATUSES) {
      expect(ORDER_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('places the six progress steps in lifecycle order', () => {
    expect(ORDER_STATUS_STEPS).toEqual([
      'PLACED',
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
  });

  it('only exposes PLACED and CONFIRMED as customer-cancellable', () => {
    expect(CUSTOMER_CANCELLABLE_STATUSES).toEqual(['PLACED', 'CONFIRMED']);
    expect(isCustomerCancellable('PLACED')).toBe(true);
    expect(isCustomerCancellable('CONFIRMED')).toBe(true);
    expect(isCustomerCancellable('PREPARING')).toBe(false);
    expect(isCustomerCancellable('READY_FOR_PICKUP')).toBe(false);
    expect(isCustomerCancellable('OUT_FOR_DELIVERY')).toBe(false);
    expect(isCustomerCancellable('DELIVERED')).toBe(false);
    expect(isCustomerCancellable('CANCELLED')).toBe(false);
  });

  it('labels every payment status and method', () => {
    const methods: PaymentMethod[] = ['UPI', 'CARD', 'NET_BANKING', 'WALLET', 'COD'];
    const statuses: PaymentStatus[] = [
      'PENDING',
      'AUTHORIZED',
      'PAID',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
    ];
    for (const method of methods) {
      expect(PAYMENT_METHOD_LABELS[method].length).toBeGreaterThan(0);
    }
    for (const status of statuses) {
      expect(PAYMENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});
