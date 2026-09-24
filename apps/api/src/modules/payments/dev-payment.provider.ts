import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentMethod, PaymentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from './payment-provider.interface';
import type { PaymentProvider } from './payment-provider.interface';

/**
 * Development/mock payment provider. It simulates payment intents and outcome
 * callbacks but NEVER processes real money. It is always explicitly labeled as
 * a development flow and is disabled in a sense when a real provider is
 * configured (the registry ignores simulation calls for non-dev providers).
 */
@Injectable()
export class DevPaymentProvider implements PaymentProvider {
  readonly id = 'dev';
  readonly supportedMethods = [
    PaymentMethod.UPI,
    PaymentMethod.CARD,
    PaymentMethod.NET_BANKING,
    PaymentMethod.WALLET,
  ];

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const db = this.prisma.requireClient();
    const providerPaymentId = `dev_${randomUUID()}`;
    await db.devPaymentRecord.create({
      data: {
        providerPaymentId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        method: input.method,
        status: PaymentStatus.PENDING,
      },
    });
    return { providerPaymentId, providerOrderId: null };
  }

  async verify(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const db = this.prisma.requireClient();
    const record = await db.devPaymentRecord.findUnique({
      where: { providerPaymentId: input.providerPaymentId },
    });
    if (!record) {
      return {
        verified: false,
        status: PaymentStatus.FAILED,
        failureReason: 'Unknown payment reference',
        paidAt: null,
      };
    }
    if (record.amountMinor !== input.expectedAmountMinor) {
      return {
        verified: false,
        status: PaymentStatus.FAILED,
        failureReason: 'Payment amount does not match the checkout total',
        paidAt: null,
      };
    }
    if (record.status === PaymentStatus.PAID) {
      return {
        verified: true,
        status: PaymentStatus.PAID,
        failureReason: null,
        paidAt: record.updatedAt,
      };
    }
    if (record.status === PaymentStatus.FAILED || record.status === PaymentStatus.CANCELLED) {
      return {
        verified: false,
        status: record.status,
        failureReason: record.failureReason ?? 'Payment was not completed',
        paidAt: null,
      };
    }
    return { verified: false, status: PaymentStatus.PENDING, failureReason: null, paidAt: null };
  }

  async simulateOutcome(providerPaymentId: string, outcome: 'success' | 'failure'): Promise<void> {
    const db = this.prisma.requireClient();
    await db.devPaymentRecord.update({
      where: { providerPaymentId },
      data: {
        status: outcome === 'success' ? PaymentStatus.PAID : PaymentStatus.FAILED,
        failureReason: outcome === 'success' ? null : 'Developer simulated failure',
      },
    });
  }
}
