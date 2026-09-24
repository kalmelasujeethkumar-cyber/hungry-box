import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentMethod } from '@hungrybox/shared';
import type { ValidatedCheckout } from './checkout-validation.service';
import { CheckoutService } from './checkout.service';
import { CheckoutConflictException } from '../../common/exceptions/checkout-conflict.exception';
import type { PaymentProviderRegistry } from '../payments/payment-provider.registry';
import type { PaymentsService } from '../payments/payments.service';

function validated(overrides: Partial<ValidatedCheckout> = {}): ValidatedCheckout {
  return {
    branchId: 'b1',
    branch: { id: 'b1', name: 'Hungry Box Guntur (Demo)', code: 'guntur', city: 'Guntur' },
    address: {
      id: 'a1',
      customerId: 'cust-1',
      label: 'Home',
      recipientName: 'Demo Customer',
      phone: '9090909090',
      houseFlat: '1-2',
      streetArea: 'Main Road',
      landmark: 'Bus Stop',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      postalCode: '522001',
      latitude: 16.3067,
      longitude: 80.4365,
      deliveryInstructions: null,
    },
    serviceable: true,
    distanceKm: 0,
    items: [],
    unavailableItems: [],
    priceChanges: [],
    subtotalMinor: 71800,
    discountMinor: 4000,
    deliveryFeeMinor: 3000,
    taxMinor: 0,
    totalMinor: 70800,
    itemCount: 3,
    ...overrides,
  } as ValidatedCheckout;
}

function buildService(deps: {
  resolve?: (customerId: string, addressId: string) => Promise<ValidatedCheckout>;
  createForCheckout?: ReturnType<typeof vi.fn>;
  current?: () => Promise<{ id: string; supportedMethods: readonly PaymentMethod[] }>;
}) {
  const checkoutValidation = {
    resolve: deps.resolve ?? vi.fn().mockResolvedValue(validated()),
  };
  const payments = {
    createForCheckout:
      deps.createForCheckout ??
      vi.fn().mockResolvedValue({
        paymentId: 'pay-1',
        provider: 'dev',
        providerPaymentId: 'dev_x',
        providerOrderId: null,
        amountMinor: 70800,
        currency: 'INR',
        method: 'UPI',
        status: 'PENDING',
      }),
  } as unknown as PaymentsService;
  const providers = {
    current:
      deps.current ??
      vi.fn().mockResolvedValue({ id: 'dev', supportedMethods: ['UPI', 'CARD'] as const }),
  } as unknown as PaymentProviderRegistry;
  return new CheckoutService(checkoutValidation as never, payments, providers);
}

describe('CheckoutService.preview', () => {
  it('returns an ok preview with server totals and supported methods', async () => {
    const service = buildService({});
    const preview = await service.preview('cust-1', 'a1');

    expect(preview.status).toBe('ok');
    expect(preview.totalMinor).toBe(70800);
    expect(preview.availablePaymentMethods).toEqual(['UPI', 'CARD']);
    expect(preview.needsConfirmation).toBe(false);
  });

  it('surfaces an unserviceable status', async () => {
    const service = buildService({
      resolve: vi.fn().mockResolvedValue(validated({ serviceable: false })),
    });
    const preview = await service.preview('cust-1', 'a1');
    expect(preview.status).toBe('unserviceable');
  });

  it('surfaces unavailable status when items are missing', async () => {
    const service = buildService({
      resolve: vi.fn().mockResolvedValue(
        validated({
          unavailableItems: [
            { productId: 'p2', productName: 'Chicken 65 Roll', reason: 'Out of stock' },
          ],
        }),
      ),
    });
    const preview = await service.preview('cust-1', 'a1');
    expect(preview.status).toBe('unavailable');
  });

  it('asks for confirmation when prices changed', async () => {
    const service = buildService({
      resolve: vi.fn().mockResolvedValue(
        validated({
          priceChanges: [
            {
              productId: 'p1',
              productName: 'Biryani',
              fromUnitPriceMinor: 1,
              toUnitPriceMinor: 2,
              fromUnitDiscountMinor: 0,
              toUnitDiscountMinor: 0,
            },
          ],
        }),
      ),
    });
    const preview = await service.preview('cust-1', 'a1');
    expect(preview.needsConfirmation).toBe(true);
  });
});

describe('CheckoutService.createPaymentIntent', () => {
  it('defers the exact amount to the server-validated checkout', async () => {
    const createForCheckout = vi.fn().mockResolvedValue({
      paymentId: 'pay-1',
      provider: 'dev',
      providerPaymentId: 'dev_x',
      providerOrderId: null,
      amountMinor: 70800,
      currency: 'INR',
      method: 'UPI',
      status: 'PENDING',
    });
    const service = buildService({ createForCheckout });

    const intent = await service.createPaymentIntent('cust-1', { addressId: 'a1', method: 'UPI' });

    expect(createForCheckout).toHaveBeenCalledWith('cust-1', {
      amountMinor: 70800,
      currency: 'INR',
      method: 'UPI',
    });
    expect(intent.paymentId).toBe('pay-1');
  });

  it('rejects when items are unavailable with code checkout.unavailable', async () => {
    const createForCheckout = vi.fn();
    const service = buildService({
      createForCheckout,
      resolve: vi.fn().mockResolvedValue(
        validated({
          unavailableItems: [
            { productId: 'p2', productName: 'Chicken 65 Roll', reason: 'Out of stock' },
          ],
        }),
      ),
    });

    const error = await service
      .createPaymentIntent('cust-1', { addressId: 'a1', method: 'UPI' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckoutConflictException);
    expect((error as CheckoutConflictException).code).toBe('checkout.unavailable');
    expect((error as CheckoutConflictException).preview?.status).toBe('unavailable');
    expect(createForCheckout).not.toHaveBeenCalled();
  });

  it('rejects unserviceable addresses with code checkout.unserviceable', async () => {
    const service = buildService({
      resolve: vi.fn().mockResolvedValue(validated({ serviceable: false })),
    });

    const error = await service
      .createPaymentIntent('cust-1', { addressId: 'a1', method: 'UPI' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckoutConflictException);
    expect((error as CheckoutConflictException).code).toBe('checkout.unserviceable');
  });

  it('rejects price changes with code checkout.prices_changed', async () => {
    const service = buildService({
      resolve: vi.fn().mockResolvedValue(
        validated({
          priceChanges: [
            {
              productId: 'p1',
              productName: 'Biryani',
              fromUnitPriceMinor: 1,
              toUnitPriceMinor: 2,
              fromUnitDiscountMinor: 0,
              toUnitDiscountMinor: 0,
            },
          ],
        }),
      ),
    });

    const error = await service
      .createPaymentIntent('cust-1', { addressId: 'a1', method: 'UPI' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckoutConflictException);
    expect((error as CheckoutConflictException).code).toBe('checkout.prices_changed');
  });

  it('never lets the client dictate the payment amount', async () => {
    const createForCheckout = vi.fn().mockResolvedValue({});
    const service = buildService({ createForCheckout });

    await service.createPaymentIntent('cust-1', {
      addressId: 'a1',
      method: 'UPI',
      amountMinor: 1,
    } as never);

    const forwarded = createForCheckout.mock.calls[0][1];
    expect(forwarded).toMatchObject({ amountMinor: 70800, currency: 'INR' });
    expect(forwarded).not.toHaveProperty('amountMinorFromClient');
  });

  it('rejects an unsupported payment method', async () => {
    const createForCheckout = vi.fn().mockRejectedValue(new BadRequestException());
    const service = buildService({
      createForCheckout,
      current: vi.fn().mockResolvedValue({ id: 'dev', supportedMethods: ['UPI'] as const }),
    });

    const error = await service
      .createPaymentIntent('cust-1', { addressId: 'a1', method: 'CARD' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
  });
});
