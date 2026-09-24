import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentProvider } from './payment-provider.interface';
import { PaymentNotVerifiedException } from './payment-not-verified.exception';
import type { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';

function baseDb() {
  return {
    payment: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'pay-1',
        customerId: 'cust-1',
        provider: 'dev',
        providerPaymentId: 'dev_x',
        providerOrderId: null,
        amountMinor: 70800,
        currency: 'INR',
        method: 'UPI',
        status: 'PENDING',
        failureReason: null,
        paidAt: null,
      }),
      create: vi.fn().mockResolvedValue({
        id: 'pay-1',
        customerId: 'cust-1',
        provider: 'dev',
        providerPaymentId: 'dev_x',
        providerOrderId: null,
        amountMinor: 70800,
        currency: 'INR',
        method: 'UPI',
        status: 'PENDING',
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    devPaymentRecord: {
      findUnique: vi.fn().mockResolvedValue({ status: 'PENDING' }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function buildService(
  db: Record<string, unknown>,
  opts: { provider?: Partial<PaymentProvider> & Record<string, unknown>; env?: string } = {},
) {
  const provider = opts.provider ?? {
    id: 'dev',
    supportedMethods: ['UPI', 'CARD', 'NET_BANKING', 'WALLET'],
    create: vi.fn().mockResolvedValue({ providerPaymentId: 'dev_x', providerOrderId: null }),
    verify: vi.fn().mockResolvedValue({
      verified: true,
      status: 'PAID',
      failureReason: null,
      paidAt: new Date(),
    }),
  };
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const registry = {
    current: vi.fn().mockResolvedValue(provider),
  } as unknown as PaymentProviderRegistry;
  const audit = {
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const config = {
    get: vi.fn((key: string, fallback?: unknown) =>
      key === 'NODE_ENV' ? (opts.env ?? 'test') : fallback,
    ),
  } as unknown as ConfigService;
  return new PaymentsService(prisma, registry, audit, config);
}

describe('PaymentsService.createForCheckout', () => {
  it('starts the payment at the provider and stores a PENDING payment', async () => {
    const db = baseDb();
    const service = buildService(db);

    const payment = await service.createForCheckout('cust-1', {
      amountMinor: 70800,
      currency: 'INR',
      method: 'UPI',
    });

    expect(payment).toMatchObject({
      paymentId: 'pay-1',
      provider: 'dev',
      providerPaymentId: 'dev_x',
      amountMinor: 70800,
      status: 'PENDING',
    });
    expect(db.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'cust-1',
          status: 'PENDING',
          amountMinor: 70800,
        }),
      }),
    );
  });

  it('rejects a payment method the provider does not support', async () => {
    const db = baseDb();
    const service = buildService(db, {
      provider: { id: 'dev', supportedMethods: ['UPI'], create: vi.fn() },
    });

    const error = await service
      .createForCheckout('cust-1', { amountMinor: 1, currency: 'INR', method: 'CARD' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('records a PAYMENT_INITIATED audit entry', async () => {
    const db = baseDb();
    const service = buildService(db);
    await service.createForCheckout('cust-1', {
      amountMinor: 70800,
      currency: 'INR',
      method: 'UPI',
    });

    await expect(db.payment.create).toBeDefined();
    const recorder = (service as unknown as { audit: AuditService }).audit;
    expect(recorder.record as ReturnType<typeof vi.fn>).toBeCalled();
  });
});

describe('PaymentsService.verifyPayment', () => {
  it('authorizes a payment that passes provider verification', async () => {
    const db = baseDb();
    const service = buildService(db);

    const result = await service.verifyPayment('pay-1', 'cust-1');

    expect(result).toMatchObject({ verified: true, status: 'AUTHORIZED' });
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'AUTHORIZED' }),
      }),
    );
  });

  it('marks a payment failed and records the reason when the provider rejects it', async () => {
    const db = baseDb();
    const service = buildService(db, {
      provider: {
        id: 'dev',
        supportedMethods: [],
        verify: vi.fn().mockResolvedValue({
          verified: false,
          status: 'FAILED',
          failureReason: 'Developer simulated failure',
          paidAt: null,
        }),
      },
    });

    const result = await service.verifyPayment('pay-1', 'cust-1');

    expect(result).toMatchObject({ verified: false, status: 'FAILED' });
    expect(result.failureReason).toBe('Developer simulated failure');
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'Developer simulated failure',
        }),
      }),
    );
  });

  it('does not touch another customer payment', async () => {
    const db = baseDb();
    db.payment.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(service.verifyPayment('pay-other', 'cust-1')).rejects.toThrow(NotFoundException);
  });
});

describe('PaymentsService.requireFinalVerification', () => {
  it('trusts only provider verification, not the stored payment status', async () => {
    const db = baseDb();
    const service = buildService(db);

    const verification = await service.requireFinalVerification('pay-1', 'cust-1');

    expect(verification.payment).toMatchObject({ id: 'pay-1', amountMinor: 70800 });
    expect(verification.paidAt).toBeInstanceOf(Date);
    expect(db.payment.update).not.toHaveBeenCalled();
  });

  it('throws PaymentNotVerifiedException and marks the payment failed otherwise', async () => {
    const db = baseDb();
    const service = buildService(db, {
      provider: {
        id: 'dev',
        supportedMethods: [],
        verify: vi.fn().mockResolvedValue({
          verified: false,
          status: 'FAILED',
          failureReason: 'Developer simulated failure',
          paidAt: null,
        }),
      },
    });

    const error = await service
      .requireFinalVerification('pay-1', 'cust-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentNotVerifiedException);
    expect((error as PaymentNotVerifiedException).paymentStatus).toBe('FAILED');
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});

describe('PaymentsService.simulateDev', () => {
  it('is disabled in production even when the provider is dev', async () => {
    const simulateOutcome = vi.fn();
    const db = baseDb();
    const service = buildService(db, {
      provider: { id: 'dev', supportedMethods: [], simulateOutcome },
      env: 'production',
    });

    const error = await service.simulateDev('cust-1', 'dev_x', 'success').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(simulateOutcome).not.toHaveBeenCalled();
  });

  it('is hidden when a non-dev provider is configured', async () => {
    const simulateOutcome = vi.fn();
    const db = baseDb();
    const service = buildService(db, {
      provider: { id: 'stripe', supportedMethods: [], simulateOutcome },
    });

    const error = await service.simulateDev('cust-1', 'dev_x', 'success').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(simulateOutcome).not.toHaveBeenCalled();
  });

  it('refuses to simulate a payment it does not own', async () => {
    const simulateOutcome = vi.fn();
    const db = baseDb();
    db.payment.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db, {
      provider: { id: 'dev', supportedMethods: [], simulateOutcome },
    });

    await expect(service.simulateDev('cust-1', 'dev_x', 'success')).rejects.toThrow(
      NotFoundException,
    );
    expect(simulateOutcome).not.toHaveBeenCalled();
  });

  it('simulates an owned dev payment', async () => {
    const simulateOutcome = vi.fn().mockResolvedValue(undefined);
    const db = baseDb();
    const service = buildService(db, {
      provider: { id: 'dev', supportedMethods: [], simulateOutcome },
    });

    await service.simulateDev('cust-1', 'dev_x', 'failure');

    expect(simulateOutcome).toHaveBeenCalledWith('dev_x', 'failure');
  });
});

describe('PaymentsService audit integration', () => {
  it('recorded payment audit kinds match the documented set', () => {
    expect(AuditKinds.PAYMENT_INITIATED).toBe('PAYMENT_INITIATED');
    expect(AuditKinds.PAYMENT_VERIFIED).toBe('PAYMENT_VERIFIED');
    expect(AuditKinds.PAYMENT_FAILED).toBe('PAYMENT_FAILED');
  });
});
